/**
 * Rutas de API del control de la oficina (SOLO SERVIDOR; las rutas de Next.js son envoltorios finos):
 *  - Pausar / reanudar la oficina (`/api/oficina/pausa`).
 *  - Seguimientos propuestos por los agentes: listar, aprobar, rechazar (`/api/seguimientos`).
 *  - Rutinas: listar con su coste, ver las sugeridas por las plantillas, crear (siempre desactivadas), activar y desactivar (`/api/rutinas`).
 *  - Por qué empezó cada tarea y su cadena (`/api/tareas`).
 * La empresa y la persona salen SIEMPRE de la sesión; los cuerpos se validan con zod estricto. Escribir: propietarios y administradores.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { cadenaDesdeOrigen, describirOrigen, type NombresOrigen } from "../agents/origen.ts";
import type { EslabonCadena, TipoOrigen } from "../agents/store.ts";
import type { Sesion } from "../creditos/api.ts";
import { proximaDespuesDe } from "../creditos/rutinas.ts";
import { costeMensualRutina, FRECUENCIAS_RUTINA_IDS, type FrecuenciaRutina, type TipoDeTareaId } from "../creditos/tarifas.ts";
import { obtenerPlantilla } from "../agentes/plantillas/index.ts";
import { esGestor } from "../empresas/permisos.ts";
import { filasDePersonas } from "../empresas/sesion.ts";

export type DepsOficina = {
  db: SupabaseClient;
  autenticar: (req: Request) => Promise<Sesion | null>;
  ahora?: () => Date;
  log?: Pick<Console, "error">;
};

const json = (cuerpo: unknown, status = 200) => Response.json(cuerpo, { status, headers: { "cache-control": "no-store" } });
const fallo = (status: number, error: string, mensaje: string, extra: Record<string, unknown> = {}) => json({ error, mensaje, ...extra }, status);
const incidencias = (e: z.ZodError) => e.issues.map((i) => ({ campo: i.path.join(".") || null, mensaje: i.message }));
const UUID = z.uuid();

async function entrar(req: Request, deps: DepsOficina, admin: boolean): Promise<{ sesion: Sesion } | { res: Response }> {
  const sesion = await deps.autenticar(req);
  if (!sesion) return { res: fallo(401, "no_autenticado", "Inicia sesión para continuar.") };
  if (admin && !esGestor(sesion.rol)) return { res: fallo(403, "sin_permiso", "Solo los propietarios y administradores de la empresa pueden hacer esto.") };
  return { sesion };
}
async function cuerpo(req: Request): Promise<unknown> {
  const t = await req.text();
  if (!t.trim()) return {};
  try { return JSON.parse(t); } catch { return Symbol.for("json_invalido"); }
}
function interno(deps: DepsOficina, donde: string, e: unknown) {
  (deps.log ?? console).error(`[api/oficina] ${donde}:`, e instanceof Error ? e.message : e);
  return fallo(500, "error_interno", "No se pudo completar la operación. Inténtalo de nuevo.");
}

// ── Pausar la oficina ───────────────────────────────────────────────────────────────────────────
/** Tareas de eventos que esperan (sin empezar) en una oficina. */
async function eventosEsperando(db: SupabaseClient, companyId: string): Promise<string[]> {
  const { data, error } = await db.from("tasks").select("id").eq("company_id", companyId).in("status", ["running", "scheduled"]).eq("origen", "evento_externo").eq("es_simulacion", false);
  if (error) throw new Error(error.message);
  const ids = (data ?? []).map((t) => t.id as string);
  if (ids.length === 0) return [];
  const { data: empezadas } = await db.from("task_steps").select("task_id").in("task_id", ids).eq("position", 0);
  const ya = new Set((empezadas ?? []).map((s) => s.task_id as string));
  return ids.filter((id) => !ya.has(id));
}

export async function pausaGetHandler(req: Request, deps: DepsOficina): Promise<Response> {
  const e = await entrar(req, deps, false);
  if ("res" in e) return e.res;
  try {
    const { data, error } = await deps.db.from("company_credit_settings").select("agentes_pausados, agentes_pausados_en, agentes_pausados_por, eventos_por_minuto").eq("company_id", e.sesion.companyId).single();
    if (error) throw new Error(error.message);
    return json({ pausada: data.agentes_pausados, pausadaEn: data.agentes_pausados_en, eventosPorMinuto: data.eventos_por_minuto, eventosEsperando: (await eventosEsperando(deps.db, e.sesion.companyId)).length });
  } catch (err) { return interno(deps, "pausa GET", err); }
}

const PausaSchema = z.union([
  z.object({ pausar: z.literal(true) }).strict(),
  // Al reanudar, la empresa elige qué hacer con los eventos que llegaron mientras tanto.
  z.object({ pausar: z.literal(false), pendientes: z.enum(["procesar", "descartar"]) }).strict(),
]);

/** Pausa (ninguna tarea nueva empieza; los eventos se guardan) o reanuda (procesando o descartando lo que llegó). */
export async function pausaPostHandler(req: Request, deps: DepsOficina): Promise<Response> {
  const e = await entrar(req, deps, true);
  if ("res" in e) return e.res;
  const v = PausaSchema.safeParse(await cuerpo(req));
  if (!v.success) return fallo(400, "peticion_invalida", "La petición no es válida.", { incidencias: incidencias(v.error) });
  const { companyId, userId } = e.sesion;
  const ahora = (deps.ahora ?? (() => new Date()))();
  try {
    if (v.data.pausar) {
      const { error } = await deps.db.from("company_credit_settings").update({ agentes_pausados: true, agentes_pausados_por: userId, agentes_pausados_en: ahora.toISOString() }).eq("company_id", companyId);
      if (error) throw new Error(error.message);
      return json({ pausada: true });
    }
    // Una pausa impuesta por SAMGPLE (impago, abuso o petición) solo la quita SAMGPLE.
    const { data: ajustes } = await deps.db.from("company_credit_settings").select("pausada_por_samgple").eq("company_id", companyId).single();
    if (ajustes?.pausada_por_samgple) return fallo(409, "pausada_por_samgple", "SAMGPLE ha pausado tu oficina. Escríbenos para reanudarla.");
    let descartadas = 0;
    if (v.data.pendientes === "descartar") {
      const ids = await eventosEsperando(deps.db, companyId);
      if (ids.length) {
        const motivo = "Descartada: la empresa reanudó la oficina eligiendo descartar lo que llegó mientras estaba pausada.";
        const { error } = await deps.db.from("tasks").update({ status: "review", review_reason: motivo, finished_at: ahora.toISOString() }).eq("company_id", companyId).in("id", ids);
        if (error) throw new Error(error.message);
        await deps.db.from("eventos_externos").update({ estado: "descartado", motivo }).eq("company_id", companyId).in("task_id", ids);
        descartadas = ids.length;
      }
    }
    const { error } = await deps.db.from("company_credit_settings").update({ agentes_pausados: false, agentes_pausados_por: null, agentes_pausados_en: null }).eq("company_id", companyId);
    if (error) throw new Error(error.message);
    return json({ pausada: false, descartadas });
  } catch (err) { return interno(deps, "pausa POST", err); }
}

// ── Seguimientos ────────────────────────────────────────────────────────────────────────────────
export async function seguimientosGetHandler(req: Request, deps: DepsOficina): Promise<Response> {
  const e = await entrar(req, deps, false);
  if ("res" in e) return e.res;
  try {
    const { data, error } = await deps.db.from("agent_followups")
      .select("id, agent_id, fecha_prevista, motivo, mensaje_previsto, estado, creado_en, task_id, agents(name)")
      .eq("company_id", e.sesion.companyId).order("creado_en", { ascending: false }).limit(50);
    if (error) throw new Error(error.message);
    return json({
      seguimientos: (data ?? []).map((s) => ({
        id: s.id, agente: (s.agents as { name?: string } | null)?.name ?? "Agente", fecha: s.fecha_prevista, motivo: s.motivo,
        mensajePrevisto: s.mensaje_previsto, estado: s.estado, creadoEn: s.creado_en, tareaProgramada: s.task_id,
      })),
    });
  } catch (err) { return interno(deps, "seguimientos GET", err); }
}

const DecisionSchema = z.object({ decision: z.enum(["aprobar", "rechazar"]) }).strict();
export async function seguimientoPostHandler(req: Request, id: string, deps: DepsOficina): Promise<Response> {
  const e = await entrar(req, deps, true);
  if ("res" in e) return e.res;
  if (!UUID.safeParse(id).success) return fallo(404, "no_encontrado", "Ese seguimiento no existe.");
  const v = DecisionSchema.safeParse(await cuerpo(req));
  if (!v.success) return fallo(400, "peticion_invalida", "La petición no es válida.", { incidencias: incidencias(v.error) });
  const { data, error } = await deps.db.rpc("seguimiento_resolver", { p_company_id: e.sesion.companyId, p_seguimiento_id: id, p_user_id: e.sesion.userId, p_aprobar: v.data.decision === "aprobar" });
  if (error) {
    if (error.code === "P0002") return fallo(404, "no_encontrado", "Ese seguimiento no existe.");
    if (error.code === "42501") return fallo(403, "sin_permiso", "Solo los propietarios y administradores resuelven seguimientos.");
    return interno(deps, "seguimiento POST", error);
  }
  return json(data);
}

// ── Rutinas ─────────────────────────────────────────────────────────────────────────────────────
type FilaRutina = {
  id: string; agent_id: string; nombre: string; descripcion: string | null; instruccion: string; tipo_tarea: TipoDeTareaId; frecuencia: FrecuenciaRutina;
  activa: boolean; activada_por: string | null; activada_en: string | null; max_ejecuciones_mes: number; ejecuciones_mes: number; mes_contador: string | null;
  proxima_ejecucion_en: string; sugerida_de: string | null;
};
const rutinaParaCliente = (r: FilaRutina, nombres: Map<string, string>, personas: Map<string, string>, mes: string) => ({
  id: r.id, agenteId: r.agent_id, agente: nombres.get(r.agent_id) ?? "Agente", nombre: r.nombre, descripcion: r.descripcion, instruccion: r.instruccion,
  tipoTarea: r.tipo_tarea, frecuencia: r.frecuencia, activa: r.activa, activadaPor: r.activada_por ? personas.get(r.activada_por) ?? "Una persona" : null,
  activadaEn: r.activada_en, maxEjecucionesMes: r.max_ejecuciones_mes, ejecucionesEsteMes: r.mes_contador?.slice(0, 7) === mes ? r.ejecuciones_mes : 0,
  proximaEjecucion: r.proxima_ejecucion_en, sugeridaDe: r.sugerida_de, costeMensualEstimado: costeMensualRutina(r.tipo_tarea, r.frecuencia, r.max_ejecuciones_mes),
});

export async function rutinasGetHandler(req: Request, deps: DepsOficina): Promise<Response> {
  const e = await entrar(req, deps, false);
  if ("res" in e) return e.res;
  const { companyId } = e.sesion;
  try {
    const [{ data: rutinas, error }, { data: agentes, error: e2 }, { data: personas }] = await Promise.all([
      deps.db.from("agent_routines").select("*").eq("company_id", companyId).order("creado_en"),
      deps.db.from("agents").select("id, name, template_id, estado").eq("company_id", companyId),
      filasDePersonas(deps.db, companyId),
    ]);
    if (error || e2) throw new Error((error ?? e2)!.message);
    const nombres = new Map((agentes ?? []).map((a) => [a.id as string, a.name as string]));
    const quien = new Map((personas ?? []).map((p) => [p.id as string, p.full_name as string]));
    const mes = (deps.ahora ?? (() => new Date()))().toISOString().slice(0, 7);
    const filas = (rutinas ?? []) as FilaRutina[];
    const anadidas = new Set(filas.map((r) => r.sugerida_de).filter(Boolean));
    // Rutinas que sugieren las plantillas de los agentes de la empresa y que aún no se han añadido. Nunca activas.
    const sugeridas = (agentes ?? []).flatMap((a) => {
      const p = a.template_id ? obtenerPlantilla(a.template_id as string) : undefined;
      return (p?.rutinasSugeridas ?? [])
        .filter((r) => !anadidas.has(`plantilla:${p!.id}:${r.id}:${a.id}`))
        .map((r) => ({
          clave: `plantilla:${p!.id}:${r.id}:${a.id}`, agenteId: a.id as string, agente: a.name as string, nombre: r.nombre, descripcion: r.descripcion,
          tipoTarea: r.tipoTarea, frecuencia: r.frecuencia, maxEjecucionesMes: r.maxEjecucionesMes, costeMensualEstimado: costeMensualRutina(r.tipoTarea, r.frecuencia, r.maxEjecucionesMes),
        }));
    });
    const listaAgentes = (agentes ?? []).filter((a) => a.estado !== "archivado").map((a) => ({ id: a.id as string, nombre: a.name as string }));
    return json({ rutinas: filas.map((r) => rutinaParaCliente(r, nombres, quien, mes)), sugeridas, agentes: listaAgentes });
  } catch (err) { return interno(deps, "rutinas GET", err); }
}

const NuevaRutinaSchema = z.union([
  z.object({
    agenteId: UUID, nombre: z.string().trim().min(1).max(120), descripcion: z.string().trim().max(500).optional(), instruccion: z.string().trim().min(1).max(2000),
    tipoTarea: z.enum(["simple", "estandar", "experta"]), frecuencia: z.enum(FRECUENCIAS_RUTINA_IDS), maxEjecucionesMes: z.number().int().min(1).max(744),
  }).strict(),
  /** Añadir una rutina sugerida por la plantilla del agente (clave que devuelve GET). */
  z.object({ sugerida: z.string().regex(/^plantilla:[a-z0-9-]+:[a-z0-9-]+:[0-9a-f-]{36}$/) }).strict(),
]);

/** Crea una rutina. SIEMPRE desactivada: para que trabaje, una persona la activa después viendo su coste. */
export async function rutinasPostHandler(req: Request, deps: DepsOficina): Promise<Response> {
  const e = await entrar(req, deps, true);
  if ("res" in e) return e.res;
  const v = NuevaRutinaSchema.safeParse(await cuerpo(req));
  if (!v.success) return fallo(400, "peticion_invalida", "La petición no es válida.", { incidencias: incidencias(v.error) });
  const { companyId, userId } = e.sesion;
  try {
    let datos: { agenteId: string; nombre: string; descripcion: string | null; instruccion: string; tipoTarea: TipoDeTareaId; frecuencia: FrecuenciaRutina; maxEjecucionesMes: number; sugeridaDe: string | null };
    if ("sugerida" in v.data) {
      const [, plantillaId, rutinaId, agenteId] = v.data.sugerida.split(":");
      const { data: agente } = await deps.db.from("agents").select("id, template_id").eq("company_id", companyId).eq("id", agenteId).maybeSingle();
      const r = agente?.template_id === plantillaId ? obtenerPlantilla(plantillaId)?.rutinasSugeridas?.find((x) => x.id === rutinaId) : undefined;
      if (!r) return fallo(404, "no_encontrado", "Esa rutina sugerida no existe para este agente.");
      datos = { agenteId, nombre: r.nombre, descripcion: r.descripcion, instruccion: r.instruccion, tipoTarea: r.tipoTarea, frecuencia: r.frecuencia, maxEjecucionesMes: r.maxEjecucionesMes, sugeridaDe: v.data.sugerida };
    } else {
      const { data: agente } = await deps.db.from("agents").select("id").eq("company_id", companyId).eq("id", v.data.agenteId).maybeSingle();
      if (!agente) return fallo(404, "no_encontrado", "Ese agente no existe en vuestra oficina.");
      datos = { ...v.data, descripcion: v.data.descripcion ?? null, sugeridaDe: null };
    }
    const ahora = (deps.ahora ?? (() => new Date()))();
    const { data, error } = await deps.db.from("agent_routines").insert({
      company_id: companyId, agent_id: datos.agenteId, nombre: datos.nombre, descripcion: datos.descripcion, instruccion: datos.instruccion, tipo_tarea: datos.tipoTarea,
      frecuencia: datos.frecuencia, max_ejecuciones_mes: datos.maxEjecucionesMes, sugerida_de: datos.sugeridaDe, creado_por: userId,
      proxima_ejecucion_en: proximaDespuesDe(datos.frecuencia, ahora, ahora).toISOString(), activa: false,
    }).select("id").single();
    if (error || !data) throw new Error(error?.message ?? "sin datos");
    return json({ id: data.id, activa: false, costeMensualEstimado: costeMensualRutina(datos.tipoTarea, datos.frecuencia, datos.maxEjecucionesMes) }, 201);
  } catch (err) { return interno(deps, "rutinas POST", err); }
}

const AccionRutinaSchema = z.union([
  // Activar exige confirmar el coste que se mostró: si cambió, hay que volver a confirmarlo.
  z.object({ accion: z.literal("activar"), costeConfirmado: z.number().int().min(0) }).strict(),
  z.object({ accion: z.literal("desactivar") }).strict(),
]);
export async function rutinaPostHandler(req: Request, id: string, deps: DepsOficina): Promise<Response> {
  const e = await entrar(req, deps, true);
  if ("res" in e) return e.res;
  if (!UUID.safeParse(id).success) return fallo(404, "no_encontrado", "Esa rutina no existe.");
  const v = AccionRutinaSchema.safeParse(await cuerpo(req));
  if (!v.success) return fallo(400, "peticion_invalida", "La petición no es válida.", { incidencias: incidencias(v.error) });
  const { companyId, userId } = e.sesion;
  try {
    const { data: r } = await deps.db.from("agent_routines").select("*").eq("company_id", companyId).eq("id", id).maybeSingle();
    if (!r) return fallo(404, "no_encontrado", "Esa rutina no existe.");
    const fila = r as FilaRutina;
    if (v.data.accion === "desactivar") {
      const { error } = await deps.db.from("agent_routines").update({ activa: false }).eq("company_id", companyId).eq("id", id);
      if (error) throw new Error(error.message);
      return json({ activa: false });
    }
    const coste = costeMensualRutina(fila.tipo_tarea, fila.frecuencia, fila.max_ejecuciones_mes);
    if (v.data.costeConfirmado !== coste) return fallo(409, "coste_cambiado", `El coste estimado es de ${coste} créditos al mes: confírmalo para activarla.`, { costeMensualEstimado: coste });
    const ahora = (deps.ahora ?? (() => new Date()))();
    // Quién la activa queda registrado (la base lo exige). La próxima ejecución empieza a contar desde ahora.
    const { error } = await deps.db.from("agent_routines").update({
      activa: true, activada_por: userId, proxima_ejecucion_en: proximaDespuesDe(fila.frecuencia, ahora, ahora).toISOString(),
    }).eq("company_id", companyId).eq("id", id);
    if (error) throw new Error(error.message);
    return json({ activa: true, costeMensualEstimado: coste });
  } catch (err) { return interno(deps, "rutina POST", err); }
}

export async function rutinaDeleteHandler(req: Request, id: string, deps: DepsOficina): Promise<Response> {
  const e = await entrar(req, deps, true);
  if ("res" in e) return e.res;
  if (!UUID.safeParse(id).success) return fallo(404, "no_encontrado", "Esa rutina no existe.");
  const { error } = await deps.db.from("agent_routines").delete().eq("company_id", e.sesion.companyId).eq("id", id);
  return error ? interno(deps, "rutina DELETE", error) : json({ borrada: true });
}

// ── Por qué empezó cada tarea ───────────────────────────────────────────────────────────────────
export async function tareasGetHandler(req: Request, deps: DepsOficina): Promise<Response> {
  const e = await entrar(req, deps, false);
  if ("res" in e) return e.res;
  const { companyId } = e.sesion;
  try {
    const { data: tareas, error } = await deps.db.from("tasks")
      .select("id, agent_id, title, status, origen, origen_ref, ordenado_por, rutina_id, source_email_id, tarea_padre_id, started_at, review_reason")
      .eq("company_id", companyId).eq("es_simulacion", false).order("started_at", { ascending: false }).limit(30);
    if (error) throw new Error(error.message);
    const [{ data: agentes }, { data: personas }, { data: rutinas }] = await Promise.all([
      deps.db.from("agents").select("id, name").eq("company_id", companyId),
      filasDePersonas(deps.db, companyId),
      deps.db.from("agent_routines").select("id, nombre").eq("company_id", companyId),
    ]);
    const m = (rows: { id: unknown; [k: string]: unknown }[] | null, campo: string) => new Map((rows ?? []).map((r) => [r.id as string, r[campo] as string]));
    const ag = m(agentes, "name"), pe = m(personas, "full_name"), ru = m(rutinas, "nombre");
    const n: NombresOrigen = { agente: (id) => ag.get(id), persona: (id) => pe.get(id)?.split(" ")[0], rutina: (id) => ru.get(id) };
    const salida = [];
    for (const t of tareas ?? []) {
      const { data: c } = await deps.db.rpc("tarea_cadena", { p_company_id: companyId, p_task_id: t.id });
      const cadena: EslabonCadena[] = ((c ?? []) as Record<string, unknown>[]).map((r) => ({
        nivel: Number(r.nivel), taskId: r.task_id as string, agentId: r.agent_id as string, origen: (r.origen as TipoOrigen | null) ?? null, tareaPadreId: (r.tarea_padre_id as string | null) ?? null,
        eventoId: (r.evento_id as string | null) ?? null, sourceEmailId: (r.source_email_id as string | null) ?? null, ordenadoPor: (r.ordenado_por as string | null) ?? null,
        rutinaId: (r.rutina_id as string | null) ?? null, seguimientoId: (r.seguimiento_id as string | null) ?? null, esSimulacion: Boolean(r.es_simulacion),
        ref: (r.origen_ref as Record<string, unknown> | null) ?? {}, title: r.title as string, startedAt: r.started_at as string,
      }));
      const padre = cadena[1] ?? null;
      salida.push({
        id: t.id, titulo: t.title, estado: t.status, agente: ag.get(t.agent_id as string) ?? "Agente", empezo: t.started_at, motivoRevision: t.review_reason,
        porque: describirOrigen({ origen: (t.origen as TipoOrigen | null) ?? null, ref: (t.origen_ref as Record<string, unknown>) ?? {}, ordenadoPor: t.ordenado_por as string | null, rutinaId: t.rutina_id as string | null, sourceEmailId: t.source_email_id as string | null }, padre, n),
        cadena: cadenaDesdeOrigen(cadena, n),
      });
    }
    return json({ tareas: salida });
  } catch (err) { return interno(deps, "tareas GET", err); }
}
