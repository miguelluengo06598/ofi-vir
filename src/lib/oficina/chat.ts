/**
 * Chat con los agentes (SOLO SERVIDOR; `/api/mensajes` es un envoltorio fino).
 * Cada mensaje de una persona es una tarea REAL con origen `orden_usuario` (vía «chat»): pasa por la misma puerta que
 * cualquier tarea (agente activo y certificado, oficina operativa, parada de emergencia…), con las herramientas y los
 * permisos del agente, y queda en Tareas como «Orden de …». Nada se simula: si el agente no puede trabajar, se dice por qué.
 * La conversación es de cada persona con cada agente: nadie ve los mensajes de otra persona.
 */
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Sesion } from "../empresas/sesion.ts";
import type { EngineDeps, ResultadoTarea } from "../agents/loop.ts";
import type { AgentStore } from "../agents/store.ts";

export type DepsChat = {
  db: SupabaseClient;
  autenticar: (req: Request) => Promise<Sesion | null>;
  /** Motor de agentes (null sin clave de Claude: el chat lo dice en vez de inventar respuestas). */
  motor: () => { deps: EngineDeps; store: AgentStore } | null;
  ejecutar: (deps: EngineDeps, companyId: string, taskId: string, instruccion: string) => Promise<ResultadoTarea>;
  log?: Pick<Console, "error">;
};

export type MensajeChat = { id: string; from: "me" | "agent" | "system"; text: string; time: string; day: string };
export type ConversacionChat = { agentId: string; messages: MensajeChat[]; unread: number };

const VIA = "chat";
const MAX_TEXTO = 4000;
/** Intercambios anteriores que el agente recibe como contexto (la conversación es corta por diseño). */
const CONTEXTO = 4;

const json = (cuerpo: unknown, status = 200) => Response.json(cuerpo, { status, headers: { "cache-control": "no-store" } });
const fallo = (status: number, error: string, mensaje: string) => json({ error, mensaje }, status);

const ZONA = "Europe/Madrid";
const hora = (iso: string) => new Date(iso).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", timeZone: ZONA });
function dia(iso: string, ahora = new Date()) {
  const f = (d: Date) => d.toLocaleDateString("es-ES", { timeZone: ZONA });
  const d = new Date(iso);
  if (f(d) === f(ahora)) return "Hoy";
  if (f(d) === f(new Date(ahora.getTime() - 86_400_000))) return "Ayer";
  return d.toLocaleDateString("es-ES", { day: "numeric", month: "long", timeZone: ZONA });
}

const ESTADO_SIN_RESPUESTA: Record<string, string> = {
  review: "La tarea ha quedado en revisión",
  failed: "La tarea ha fallado",
  approval: "Ha preparado algo que necesita tu aprobación: míralo en Aprobaciones",
  scheduled: "Se atenderá cuando abra el horario",
  running: "Todavía está trabajando en ello",
};

type FilaTarea = { id: string; agent_id: string; status: string; started_at: string; instruccion_entrada: string | null; review_reason: string | null };

/** Mensajes de una tarea de chat: lo que escribió la persona y la última respuesta con texto del agente (o por qué no la hay). */
function mensajesDeTarea(t: FilaTarea, respuesta: string | null, cuando: string | null): MensajeChat[] {
  const out: MensajeChat[] = [{ id: `${t.id}-yo`, from: "me", text: t.instruccion_entrada ?? "", time: hora(t.started_at), day: dia(t.started_at) }];
  if (respuesta) out.push({ id: `${t.id}-agente`, from: "agent", text: respuesta, time: hora(cuando ?? t.started_at), day: dia(cuando ?? t.started_at) });
  else if (t.status !== "running" || t.review_reason) {
    const motivo = [ESTADO_SIN_RESPUESTA[t.status] ?? "Sin respuesta", t.review_reason].filter(Boolean).join(": ");
    out.push({ id: `${t.id}-aviso`, from: "system", text: motivo, time: hora(t.started_at), day: dia(t.started_at) });
  }
  return out;
}

async function respuestas(db: SupabaseClient, companyId: string, ids: string[]) {
  const r = new Map<string, { texto: string; cuando: string }>();
  if (ids.length === 0) return r;
  const { data, error } = await db.from("task_steps").select("task_id, content, position, created_at")
    .eq("company_id", companyId).in("task_id", ids).eq("kind", "respuesta").order("position", { ascending: true });
  if (error) throw new Error(error.message);
  for (const s of data ?? []) {
    const texto = String(s.content ?? "").trim();
    if (texto && !texto.startsWith("(sin texto")) r.set(s.task_id as string, { texto, cuando: s.created_at as string });
  }
  return r;
}

async function tareasDeChat(db: SupabaseClient, sesion: Sesion, agenteId?: string, limite = 200) {
  let q = db.from("tasks").select("id, agent_id, status, started_at, instruccion_entrada, review_reason")
    .eq("company_id", sesion.companyId).eq("es_simulacion", false).eq("origen", "orden_usuario")
    .eq("ordenado_por", sesion.userId).eq("origen_ref->>via", VIA)
    .order("started_at", { ascending: false }).limit(limite);
  if (agenteId) q = q.eq("agent_id", agenteId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return ((data ?? []) as FilaTarea[]).reverse();
}

/** GET /api/mensajes: las conversaciones de la persona de la sesión con sus agentes (por slug del agente). */
export async function mensajesGetHandler(req: Request, deps: DepsChat): Promise<Response> {
  const sesion = await deps.autenticar(req);
  if (!sesion) return fallo(401, "no_autenticado", "Inicia sesión para continuar.");
  try {
    const [tareas, { data: agentes }] = await Promise.all([
      tareasDeChat(deps.db, sesion),
      deps.db.from("agents").select("id, slug").eq("company_id", sesion.companyId),
    ]);
    const slug = new Map((agentes ?? []).map((a) => [a.id as string, (a.slug as string) || (a.id as string)]));
    const resp = await respuestas(deps.db, sesion.companyId, tareas.map((t) => t.id));
    const porAgente = new Map<string, MensajeChat[]>();
    for (const t of tareas) {
      const r = resp.get(t.id);
      const id = slug.get(t.agent_id) ?? t.agent_id;
      porAgente.set(id, [...(porAgente.get(id) ?? []), ...mensajesDeTarea(t, r?.texto ?? null, r?.cuando ?? null)]);
    }
    // Las más recientes primero, como la lista de conversaciones.
    const conversaciones: ConversacionChat[] = [...porAgente.entries()]
      .map(([agentId, messages]) => ({ agentId, messages, unread: 0 }))
      .reverse();
    return json({ conversaciones, motor: deps.motor() !== null });
  } catch (e) {
    (deps.log ?? console).error("[api/mensajes] GET:", e instanceof Error ? e.message : e);
    return fallo(500, "error_interno", "No se pudieron cargar los mensajes.");
  }
}

const Cuerpo = z.object({ agenteId: z.string().min(1).max(100), texto: z.string().trim().min(1).max(MAX_TEXTO) }).strict();

/** POST /api/mensajes `{ agenteId, texto }`: la persona escribe a un agente; se crea y ejecuta una tarea real. */
export async function mensajesPostHandler(req: Request, deps: DepsChat): Promise<Response> {
  const sesion = await deps.autenticar(req);
  if (!sesion) return fallo(401, "no_autenticado", "Inicia sesión para continuar.");
  let cuerpo: unknown;
  try { cuerpo = JSON.parse((await req.text()) || "{}"); } catch { return fallo(400, "json_invalido", "El cuerpo no es JSON válido."); }
  const p = Cuerpo.safeParse(cuerpo);
  if (!p.success) return fallo(400, "datos_invalidos", `Escribe un mensaje de 1 a ${MAX_TEXTO} caracteres.`);

  // El agente se busca SIEMPRE dentro de la empresa de la sesión: el de otra empresa ni existe.
  const { data: agente } = await deps.db.from("agents").select("id, slug, name, model")
    .eq("company_id", sesion.companyId).eq("slug", p.data.agenteId).neq("estado", "archivado").maybeSingle();
  if (!agente) return fallo(404, "agente_no_encontrado", "Ese agente no existe en tu oficina.");

  const motor = deps.motor();
  if (!motor) return fallo(503, "sin_motor", "Los agentes no pueden responder ahora mismo: falta configurar la conexión con la IA.");

  try {
    // Contexto: los últimos intercambios de esta persona con este agente (sus propias palabras, no contenido externo).
    const previas = (await tareasDeChat(deps.db, sesion, agente.id as string, CONTEXTO));
    const resp = await respuestas(deps.db, sesion.companyId, previas.map((t) => t.id));
    const historial = previas
      .map((t) => `Persona: ${t.instruccion_entrada ?? ""}\nTú: ${resp.get(t.id)?.texto ?? "(sin respuesta)"}`)
      .join("\n\n");
    const instruccion = [
      "Una persona de la empresa te escribe por el chat de la oficina. Respóndele de forma breve y útil, en su idioma.",
      "Si te pide algo que hacer, hazlo con tus herramientas y dentro de tus permisos; si algo necesita aprobación, dilo.",
      historial ? `Conversación anterior con esta persona (lo más reciente al final):\n${historial}` : "",
      `Mensaje nuevo:\n${p.data.texto}`,
    ].filter(Boolean).join("\n\n");

    const titulo = `Chat: ${p.data.texto.replace(/\s+/g, " ").slice(0, 80)}`;
    const taskId = await motor.store.createTask(sesion.companyId, {
      agentId: agente.id as string, title: titulo, model: agente.model as string,
      origen: { tipo: "orden_usuario", ordenadoPor: sesion.userId, via: VIA },
      instruccionEntrada: p.data.texto,
    });
    const r = await deps.ejecutar(motor.deps, sesion.companyId, taskId, instruccion);
    const ahora = new Date().toISOString();
    const texto = r.texto.trim();
    const mensajes: MensajeChat[] = texto && r.estado !== "bloqueada"
      ? [{ id: `${taskId}-agente`, from: "agent", text: texto, time: hora(ahora), day: "Hoy" }]
      : [{ id: `${taskId}-aviso`, from: "system", text: [ESTADO_SIN_RESPUESTA[r.estado] ?? "No ha podido responder", r.motivo].filter(Boolean).join(": "), time: hora(ahora), day: "Hoy" }];
    if (texto && r.estado === "approval") mensajes.push({ id: `${taskId}-aprobacion`, from: "system", text: ESTADO_SIN_RESPUESTA.approval, time: hora(ahora), day: "Hoy" });
    return json({ taskId, estado: r.estado, mensajes });
  } catch (e) {
    (deps.log ?? console).error("[api/mensajes] POST:", e instanceof Error ? e.message : e);
    return fallo(500, "error_interno", "El agente no ha podido responder. Inténtalo de nuevo.");
  }
}
