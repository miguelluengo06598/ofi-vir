/**
 * Recepción de eventos externos (lead de Meta, formulario, WhatsApp, correo): pasa el filtro sin IA, deja el evento registrado y, si
 * procede, crea la tarea del agente con origen `evento_externo`. SOLO SERVIDOR. Los webhooks de cada canal llaman aquí después de
 * verificar su firma; el contenido es siempre externo (dato, nunca instrucción).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AgentStore } from "../agents/store.ts";
import { neutralizar } from "../email/untrusted.ts";
import {
  decidirEvento, huellaRemitente, EVENTOS_POR_MINUTO_POR_DEFECTO, type Canal, type ConsultasFiltro, type DecisionEvento, type EstadoEvento, type MotivoDescarte,
} from "./filtro.ts";

export type FilaEvento = {
  companyId: string; canal: Canal; clave: string | null; remitenteHash: string | null; contactId: string | null; emailId: string | null;
  agentId: string | null; taskId: string | null; estado: EstadoEvento; motivo: string | null; contenido: string | null;
};

/** Acceso a datos de los eventos: consultas del filtro + escribir el registro. */
export interface AlmacenEventos extends ConsultasFiltro {
  registrar(f: FilaEvento): Promise<string>;
  vincularTarea(companyId: string, eventoId: string, taskId: string): Promise<void>;
  /** Añade el contenido de un mensaje agrupado a la entrada de una tarea que aún no ha empezado. */
  anadirAEntrada(companyId: string, taskId: string, texto: string): Promise<void>;
}

export class SupabaseAlmacenEventos implements AlmacenEventos {
  private readonly db: SupabaseClient;
  constructor(db: SupabaseClient) { this.db = db; }

  async existeClave(companyId: string, canal: Canal, clave: string) {
    const { data, error } = await this.db.from("eventos_externos").select("id").eq("company_id", companyId).eq("canal", canal).eq("clave", clave).neq("estado", "descartado").limit(1);
    if (error) throw new Error("No se pudo comprobar si el evento es un duplicado.");
    return (data ?? []).length > 0;
  }

  async tareaPendienteDelRemitente(companyId: string, remitenteHash: string, desde: Date) {
    const { data, error } = await this.db.from("eventos_externos").select("task_id").eq("company_id", companyId).eq("remitente_hash", remitenteHash)
      .in("estado", ["aceptado", "agrupado"]).not("task_id", "is", null).gte("recibido_en", desde.toISOString()).order("recibido_en", { ascending: false }).limit(5);
    if (error) throw new Error("No se pudieron leer los eventos recientes.");
    for (const id of [...new Set((data ?? []).map((r) => r.task_id as string))]) {
      const [{ data: t }, { count }] = await Promise.all([
        this.db.from("tasks").select("status").eq("company_id", companyId).eq("id", id).maybeSingle(),
        this.db.from("task_steps").select("id", { count: "exact", head: true }).eq("task_id", id).eq("position", 0),
      ]);
      if (t?.status === "running" && (count ?? 0) === 0) return id;
    }
    return null;
  }

  async ritmo(companyId: string, desde: Date) {
    const [{ count, error }, { data: ajustes }] = await Promise.all([
      this.db.from("eventos_externos").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("estado", "aceptado").gte("recibido_en", desde.toISOString()),
      this.db.from("company_credit_settings").select("eventos_por_minuto").eq("company_id", companyId).maybeSingle(),
    ]);
    if (error) throw new Error("No se pudo contar los eventos recientes.");
    return { aceptados: count ?? 0, limitePorMinuto: (ajustes?.eventos_por_minuto as number | undefined) ?? EVENTOS_POR_MINUTO_POR_DEFECTO };
  }

  async registrar(f: FilaEvento) {
    const fila = {
      company_id: f.companyId, canal: f.canal, clave: f.clave, remitente_hash: f.remitenteHash, contact_id: f.contactId, email_id: f.emailId,
      agent_id: f.agentId, task_id: f.taskId, estado: f.estado, motivo: f.motivo, contenido: f.estado === "descartado" ? null : f.contenido,
    };
    let { data, error } = await this.db.from("eventos_externos").insert(fila).select("id").single();
    // Carrera con otro envío idéntico: el segundo queda como duplicado.
    if (error?.code === "23505") ({ data, error } = await this.db.from("eventos_externos").insert({ ...fila, estado: "descartado", motivo: "Evento duplicado: ya se recibió antes.", contenido: null, task_id: null }).select("id").single());
    if (error || !data) throw new Error("No se pudo registrar el evento.");
    return data.id as string;
  }

  async vincularTarea(companyId: string, eventoId: string, taskId: string) {
    const { error } = await this.db.from("eventos_externos").update({ task_id: taskId }).eq("company_id", companyId).eq("id", eventoId);
    if (error) throw new Error("No se pudo vincular el evento con su tarea.");
  }

  async anadirAEntrada(companyId: string, taskId: string, texto: string) {
    const { data } = await this.db.from("tasks").select("instruccion_entrada").eq("company_id", companyId).eq("id", taskId).maybeSingle();
    const { error } = await this.db.from("tasks").update({ instruccion_entrada: `${(data?.instruccion_entrada as string | null) ?? ""}\n\n${texto}`.trim() }).eq("company_id", companyId).eq("id", taskId).eq("status", "running");
    if (error) throw new Error("No se pudo agrupar el mensaje.");
  }
}

const ORIGEN_EN_TEXTO: Record<Canal, string> = { correo: "correo", whatsapp: "whatsapp", meta_lead: "lead de Meta", formulario: "formulario web", otro: "evento externo" };

/** El contenido de un evento tal como lo recibe el agente: delimitado como externo y neutralizado. */
export function entradaDeEvento(canal: Canal, contenido: string): string {
  return `Ha llegado un ${ORIGEN_EN_TEXTO[canal]}. Atiéndelo según tu rol; si corresponde a otro agente, pásaselo.\n\n<contenido_externo origen="${canal}">\n${neutralizar(contenido).replaceAll("<", "‹")}\n</contenido_externo>`;
}

export type EventoGenerico = {
  companyId: string;
  canal: Exclude<Canal, "correo">;
  /** Identificador del evento en su origen (id del lead, del mensaje). Sin él, la clave sale del contenido. */
  clave: string | null;
  /** Correo o teléfono de quien escribe (solo se guarda su huella). */
  remitente: string;
  agentId: string;
  model: string;
  titulo: string;
  contenido: string;
  contactId?: string | null;
};
export type ResultadoEvento = { decision: DecisionEvento; eventoId: string; taskId: string | null };

/**
 * Un evento que no es correo (lead de Meta, formulario, WhatsApp). Si se acepta, crea la tarea del agente con origen `evento_externo`
 * (en cola si se superó el límite por minuto); si es una ráfaga, se añade a la tarea pendiente; si es ruido o un duplicado, solo se
 * registra el motivo. No llama a ningún modelo.
 */
export async function recibirEvento(deps: { eventos: AlmacenEventos; store: Pick<AgentStore, "createTask" | "aplazarTarea">; ahora?: Date }, e: EventoGenerico & { automatico?: MotivoDescarte | null }): Promise<ResultadoEvento> {
  const ahora = deps.ahora ?? new Date();
  const decision = await decidirEvento(deps.eventos, { companyId: e.companyId, canal: e.canal, clave: e.clave, remitente: e.remitente, automatico: e.automatico ?? null }, ahora);
  const entrada = entradaDeEvento(e.canal, e.contenido);
  const base: FilaEvento = {
    companyId: e.companyId, canal: e.canal, clave: e.clave, remitenteHash: huellaRemitente(e.remitente), contactId: e.contactId ?? null, emailId: null,
    agentId: e.agentId, taskId: null, estado: decision.estado, motivo: decision.estado === "aceptado" ? null : decision.motivo, contenido: e.contenido,
  };
  if (decision.estado === "descartado") return { decision, eventoId: await deps.eventos.registrar(base), taskId: null };
  if (decision.estado === "agrupado") {
    const eventoId = await deps.eventos.registrar({ ...base, taskId: decision.taskId });
    await deps.eventos.anadirAEntrada(e.companyId, decision.taskId, entrada);
    return { decision, eventoId, taskId: decision.taskId };
  }
  const eventoId = await deps.eventos.registrar(base);
  const taskId = await deps.store.createTask(e.companyId, {
    agentId: e.agentId, title: e.titulo.slice(0, 200), model: e.model, contactId: e.contactId ?? null, instruccionEntrada: entrada,
    origen: { tipo: "evento_externo", eventoId, canal: e.canal },
  });
  await deps.eventos.vincularTarea(e.companyId, eventoId, taskId);
  if (decision.estado === "en_cola") await deps.store.aplazarTarea(e.companyId, taskId, { hasta: decision.hasta, instruccion: null });
  return { decision, eventoId, taskId };
}
