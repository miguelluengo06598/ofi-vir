import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { ToolError } from "../../agents/tools.ts";
import { crearServicioCreditos, type ServicioCreditos } from "../../creditos/servicio.ts";
import type { AlmacenHerramientas, LlamadaRegistrada, NuevoTraspaso, Permiso, ResultadoTraspaso, TraspasoConfigurado } from "./tipos.ts";

/**
 * Almacén del ejecutor sobre Supabase con la clave `service_role` (solo servidor). Esa clave se salta la RLS,
 * así que CADA consulta filtra por `company_id` a mano.
 */
export class SupabaseAlmacenHerramientas implements AlmacenHerramientas {
  private readonly db: SupabaseClient;
  private readonly creditos: Pick<ServicioCreditos, "puedeGastar" | "revisarEstado"> | null;
  /** `creditos`: el servicio de créditos (comprueba el estado de la oficina antes de un cobro y revisa los avisos después). */
  constructor(db: SupabaseClient, creditos: Pick<ServicioCreditos, "puedeGastar" | "revisarEstado"> | null = null) {
    this.db = db;
    this.creditos = creditos;
  }

  static fromEnv(): SupabaseAlmacenHerramientas | null {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
    if (!url || !key) return null;
    const db = createClient(url, key, { auth: { persistSession: false } });
    return new SupabaseAlmacenHerramientas(db, crearServicioCreditos({ db }));
  }

  async herramientaDeAgente(companyId: string, agentId: string, toolId: string) {
    const { data, error } = await this.db.from("agent_tools").select("permiso, limite_diario").eq("company_id", companyId).eq("agent_id", agentId).eq("tool_id", toolId).maybeSingle();
    if (error) throw new Error("No se pudo leer la herramienta del agente.");
    return data ? { permiso: data.permiso as Permiso, limiteDiario: (data.limite_diario as number | null) ?? null } : null;
  }

  async herramientasDeAgente(companyId: string, agentId: string) {
    const { data, error } = await this.db.from("agent_tools").select("tool_id, permiso, limite_diario").eq("company_id", companyId).eq("agent_id", agentId);
    if (error) throw new Error("No se pudieron leer las herramientas del agente.");
    return (data ?? []).map((r) => ({ toolId: r.tool_id as string, permiso: r.permiso as Permiso, limiteDiario: (r.limite_diario as number | null) ?? null }));
  }

  async integracionConectada(companyId: string, proveedor: string) {
    // «conectado» = hay conexión activa con su secreto. Un token que caduca se renueva al usarlo (o pasa a «caducado» y deja de contar):
    // la fecha de caducidad del token de acceso no decide si la aplicación está conectada.
    const { data, error } = await this.db.from("company_connections").select("id").eq("company_id", companyId).eq("proveedor", proveedor).eq("estado", "conectado").not("token_ref", "is", null);
    if (error) throw new Error("No se pudieron leer las conexiones.");
    return (data ?? []).length > 0;
  }

  async contarLlamadasDesde(companyId: string, agentId: string, toolId: string, desde: Date) {
    const { count, error } = await this.db.from("tool_calls").select("id", { count: "exact", head: true })
      .eq("company_id", companyId).eq("agent_id", agentId).eq("tool_id", toolId).eq("es_simulacion", false)
      .in("resultado", ["ok", "pendiente_aprobacion"]).gte("creado_en", desde.toISOString());
    if (error) throw new Error("No se pudo contar las llamadas.");
    return count ?? 0;
  }

  async registrarLlamada(companyId: string, l: LlamadaRegistrada) {
    const { error } = await this.db.from("tool_calls").insert({
      company_id: companyId, task_id: l.taskId, agent_id: l.agentId, tool_id: l.toolId, entrada_resumen: l.entradaResumen, resultado: l.resultado,
      detalle: l.detalle, permiso: l.permiso, duracion_ms: l.duracionMs, approval_id: l.approvalId, es_simulacion: l.esSimulacion,
    });
    if (error) throw new Error("No se pudo registrar la llamada.");
  }

  async crearAprobacion(companyId: string, a: { agentId: string; kind: "spend" | "other"; titulo: string; detalle: string; payload: Record<string, unknown> }) {
    const { data, error } = await this.db.from("approvals").insert({ company_id: companyId, agent_id: a.agentId, kind: a.kind, title: a.titulo, detail: a.detalle, payload: a.payload }).select("id").single();
    if (error || !data) throw new Error("No se pudo crear la aprobación.");
    return data.id as string;
  }

  async leerAprobacion(companyId: string, approvalId: string) {
    const { data, error } = await this.db.from("approvals").select("status, agent_id, payload").eq("company_id", companyId).eq("id", approvalId).maybeSingle();
    if (error) throw new Error("No se pudo leer la aprobación.");
    return data ? { status: data.status as "pending" | "approved" | "rejected", agentId: data.agent_id as string, payload: (data.payload ?? {}) as Record<string, unknown> } : null;
  }

  async llamadaPendiente(companyId: string, approvalId: string) {
    const { data, error } = await this.db.from("tool_calls").select("tool_id, agent_id, task_id").eq("company_id", companyId).eq("approval_id", approvalId).eq("resultado", "pendiente_aprobacion").limit(1).maybeSingle();
    if (error) throw new Error("No se pudo leer la llamada pendiente.");
    return data ? { toolId: data.tool_id as string, agentId: data.agent_id as string, taskId: (data.task_id as string | null) ?? null } : null;
  }

  async consumirAprobacion(companyId: string, c: { approvalId: string; agentId: string; taskId: string | null; toolId: string; decision: "aprobada" | "rechazada" }) {
    // El índice único parcial (approval_id donde resultado aprobada/rechazada) deja pasar solo a la primera.
    const { error } = await this.db.from("tool_calls").insert({
      company_id: companyId, task_id: c.taskId, agent_id: c.agentId, tool_id: c.toolId, resultado: c.decision, permiso: "aprobacion", approval_id: c.approvalId,
    });
    if (error?.code === "23505") return false;
    if (error) throw new Error("No se pudo consumir la aprobación.");
    return true;
  }

  async crearTareaHumana(companyId: string, t: { agentId: string; taskId: string | null; contactId: string | null; titulo: string; contexto: string; urgencia: "baja" | "normal" | "alta" }) {
    const { data, error } = await this.db.from("human_tasks").insert({
      company_id: companyId, agent_id: t.agentId, task_id: t.taskId, contact_id: t.contactId, titulo: t.titulo, contexto: t.contexto, urgencia: t.urgencia,
    }).select("id").single();
    if (error || !data) throw new Error("No se pudo crear la tarea para el equipo.");
    return data.id as string;
  }

  async traspasosConfigurados(companyId: string, agentIdOrigen: string): Promise<TraspasoConfigurado[]> {
    const { data, error } = await this.db.from("agent_handoffs").select("agent_id_destino, condicion, tipo_traspaso").eq("company_id", companyId).eq("agent_id_origen", agentIdOrigen).eq("activo", true);
    if (error) throw new Error("No se pudieron leer los traspasos.");
    if (!data?.length) return [];
    const { data: ags, error: e2 } = await this.db.from("agents").select("id, name, slug").eq("company_id", companyId).in("id", data.map((d) => d.agent_id_destino as string));
    if (e2) throw new Error("No se pudieron leer los agentes de destino.");
    const por = new Map((ags ?? []).map((a) => [a.id as string, a]));
    return data.flatMap((d) => {
      const a = por.get(d.agent_id_destino as string);
      return a ? [{ agenteDestinoId: a.id as string, agenteDestinoNombre: a.name as string, agenteDestinoSlug: a.slug as string, condicion: d.condicion as string, tipoTraspaso: d.tipo_traspaso as string }] : [];
    });
  }

  async crearTraspasoDirecto(companyId: string, h: NuevoTraspaso): Promise<ResultadoTraspaso> {
    // Antes de tocar nada: ¿la oficina puede gastar? (estado de la oficina y tope mensual). El saldo lo vuelve a comprobar la base al cobrar.
    if (this.creditos) {
      const p = await this.creditos.puedeGastar(companyId, h.creditos);
      if (!p.ok) throw new ToolError(`No se puede hacer el traspaso: ${p.mensaje}`);
    }
    const { data, error } = await this.db.rpc("agent_traspaso_crear", {
      p_company_id: companyId, p_from_agent: h.fromAgentId, p_to_agent: h.toAgentId, p_tipo: h.tipo, p_kind: h.kind, p_summary: h.summary, p_card: h.card,
      p_ficha: h.ficha, p_ficha_hash: h.fichaHash, p_contact_id: h.contactId, p_origin_task_id: h.originTaskId, p_instruccion: h.instruccion,
      p_max_cadena: h.maxCadena, p_creditos: h.creditos,
    });
    if (error) {
      if (error.code === "CR001") throw new ToolError("No hay créditos suficientes para hacer el traspaso. Pásalo a una persona.");
      if (error.code === "42501") throw new ToolError("Ese traspaso no está configurado (o está desactivado) para ti.");
      throw new Error("No se pudo crear el traspaso.");
    }
    const r = data as { resultado: "creado" | "bucle" | "limite"; handoff_id?: string; chain_id: string; posicion: number; task_id?: string; to_agent_name?: string };
    if (r.resultado !== "creado") {
      return { resultado: r.resultado, chainId: r.chain_id, motivo: r.resultado === "bucle" ? "la misma ficha ya había viajado entre esos dos agentes" : `la cadena ya tiene el máximo de ${h.maxCadena} traspasos` };
    }
    // Tras cobrar: avisos de saldo bajo, «sin saldo», recarga automática…
    if (this.creditos) await this.creditos.revisarEstado(companyId).catch(() => undefined);
    return { resultado: "creado", handoffId: r.handoff_id!, chainId: r.chain_id, posicion: r.posicion, taskId: r.task_id!, toAgentName: r.to_agent_name! };
  }
}
