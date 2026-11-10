/**
 * Ciclo de vida y versiones de un agente. SOLO SERVIDOR.
 *
 *  - Cada cambio guardado crea una versión con su foto completa y su motivo (`agent_version_guardar`, atómica).
 *  - Un agente que aún no trabaja (borrador, en pruebas, rechazado) recibe el cambio al momento.
 *  - Un agente que ya trabaja (certificado, activo, pausado) NO se interrumpe: la versión nueva queda en `agent_versions`, se clasifica
 *    el cambio y se envía a certificación (examen solo si es menor; certificación completa si es importante). Mientras tanto sigue
 *    trabajando la versión certificada; al certificarse, la nueva pasa a ser la que trabaja.
 *  - Volver a una versión crea otra igual; si aquella seguía certificada, se reactiva sin nueva revisión.
 *  - Plantilla actualizada: el agente no cambia solo; la empresa decide actualizar (versión nueva por la vía rápida).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { ConfigVersion } from "../../certificacion/clonar.ts";
import { requisitosParaCertificar, type Requisito } from "../../certificacion/requisitos.ts";
import { CertificacionError, enviarACertificacion, type SolicitudEnviada } from "../../certificacion/solicitudes.ts";
import { MODELOS } from "../../creditos/tarifas.ts";
import { PERMISOS } from "../herramientas/tipos.ts";
import { diferenciasEntre, type Diferencia } from "./diferencias.ts";

export class CicloError extends Error {
  readonly status: number; readonly codigo: string; readonly extra: Record<string, unknown>;
  constructor(status: number, codigo: string, mensaje: string, extra: Record<string, unknown> = {}) { super(mensaje); this.status = status; this.codigo = codigo; this.extra = extra; }
}

export type DepsCiclo = {
  db: SupabaseClient;
  /** Lanza el examen técnico de una solicitud recién creada (en Next, en segundo plano). Sin él, lo recoge la tarea periódica. */
  lanzarExamen?: (companyId: string, requestId: string) => void;
};

export const ESTADOS_QUE_TRABAJAN = ["certificado", "activo", "pausado"] as const;
const ABIERTAS = ["pendiente_examen", "pendiente_revision", "en_revision", "segunda_opinion"];

// ── Cambios que puede pedir la empresa ───────────────────────────────────────────────────────────────
const texto = (max: number) => z.string().trim().max(max);
const hora = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const CambiosSchema = z.object({
  ficha: z.object({
    nombre: texto(80).min(1), rol: texto(120).min(1), modelo: z.enum(Object.values(MODELOS) as [string, ...string[]]),
    negocio_resumen: texto(1500), tono: texto(300), objetivo: texto(800), nunca_hace: texto(1000), instrucciones_empresa: texto(6000),
  }).partial().strict().optional(),
  reglas: z.object({
    zona_horaria: texto(60).min(1), horario: z.record(z.enum(["lun", "mar", "mie", "jue", "vie", "sab", "dom"]), z.array(z.tuple([hora, hora])).max(4)),
    fuera_de_horario: z.enum(["responder_y_avisar", "no_responder", "responder_normal"]), mensaje_fuera_horario: texto(400).nullable(),
    max_mensajes_dia: z.number().int().positive().max(100000).nullable(), tope_creditos_mes: z.number().int().min(0).max(100000000).nullable(),
    aviso_ia_texto: texto(300).nullable(), idioma: texto(20).min(1),
  }).partial().strict().optional(),
  /** Sustituye la lista completa de herramientas. */
  herramientas: z.array(z.object({ tool_id: z.string().min(1).max(80), permiso: z.enum(PERMISOS), limite_diario: z.number().int().min(0).max(100000).nullable().optional() }).strict()).max(60).optional(),
  /** Sustituye la lista completa de traspasos. */
  traspasos: z.array(z.object({ agent_id_destino: z.uuid(), condicion: texto(200).min(1), tipo_traspaso: z.enum(["lead", "cita", "incidencia", "datos", "otro"]), activo: z.boolean().optional() }).strict()).max(15).optional(),
}).strict();
export type CambiosVersion = z.infer<typeof CambiosSchema>;

/** Pura: la foto de la versión nueva = la última foto + los cambios. */
export function aplicarCambios(base: ConfigVersion, cambios: CambiosVersion): ConfigVersion {
  return {
    ...base,
    ficha: { ...base.ficha, ...(cambios.ficha ?? {}) },
    reglas: cambios.reglas ? ({ ...(base.reglas ?? {}), ...cambios.reglas } as ConfigVersion["reglas"]) : base.reglas,
    herramientas: cambios.herramientas
      ? [...cambios.herramientas].sort((a, b) => a.tool_id.localeCompare(b.tool_id)).map((t) => ({ tool_id: t.tool_id, permiso: t.permiso, limite_diario: t.limite_diario ?? null }))
      : base.herramientas,
    traspasos: cambios.traspasos ? cambios.traspasos.map((t) => ({ agent_id_destino: t.agent_id_destino, condicion: t.condicion, tipo_traspaso: t.tipo_traspaso, activo: t.activo ?? true })) : base.traspasos,
  };
}

// ── Lectura ──────────────────────────────────────────────────────────────────────────────────────────
type FilaAgente = {
  id: string; name: string; estado: string; version_actual: number; version_certificada: number | null; certificado_hasta: string | null;
  template_id: string | null; template_version: number | null; pausado_motivo: string | null;
};
const COLS = "id, name, estado, version_actual, version_certificada, certificado_hasta, template_id, template_version, pausado_motivo";

async function leerAgente(db: SupabaseClient, companyId: string, agentId: string): Promise<FilaAgente> {
  const { data, error } = await db.from("agents").select(COLS).eq("company_id", companyId).eq("id", agentId).maybeSingle();
  if (error) throw new Error("No se pudo leer el agente.");
  if (!data) throw new CicloError(404, "agente_no_encontrado", "No existe ese agente en vuestra oficina.");
  return data as FilaAgente;
}

/** La foto de la última versión (la que la empresa está editando). Si aún no tenía foto, la base la guarda. */
export async function ultimaConfiguracion(db: SupabaseClient, companyId: string, agentId: string): Promise<{ agente: FilaAgente; config: ConfigVersion }> {
  const agente = await leerAgente(db, companyId, agentId);
  const { data, error } = await db.rpc("_agent_version_snapshot", { p_company_id: companyId, p_agent_id: agentId, p_version: agente.version_actual });
  if (error || !data) throw new Error("No se pudo leer la configuración del agente.");
  return { agente, config: data as ConfigVersion };
}

function errorDeBase(e: { code?: string; message: string }): CicloError {
  const m = e.message;
  if (e.code === "P0002") return new CicloError(404, "no_encontrado", m.startsWith("VERSION_NO_ENCONTRADA") ? "No existe esa versión del agente." : "No existe ese agente en vuestra oficina.");
  if (m.startsWith("VERSION_CAMBIADA")) return new CicloError(409, "version_cambiada", "El agente ha cambiado mientras lo editabas. Recarga y vuelve a intentarlo.");
  if (e.code === "42501") return new CicloError(m.startsWith("AGENTE_NO_EDITABLE") ? 409 : 422, m.split(":")[0]!.toLowerCase(), m.replace(/^[A-Z_]+:\s*/, ""));
  if (e.code === "P0001") return new CicloError(409, (/^[A-Z_]+(?=:)/.exec(m)?.[0] ?? "no_permitido").toLowerCase(), m.replace(/^[A-Z_]+:\s*/, ""));
  if (e.code === "22023") return new CicloError(400, "peticion_invalida", m.replace(/^[A-Z_]+:\s*/, ""));
  return new CicloError(500, "error_interno", "No se pudo completar la operación.");
}

// ── Guardar una versión ──────────────────────────────────────────────────────────────────────────────
export type EnvioCertificacion =
  | { enviada: true; solicitudId: string; tipo: SolicitudEnviada["tipo"]; via: SolicitudEnviada["via"]; motivos: string[] }
  | { enviada: false; motivo: string; faltan?: Requisito[] };
export type VersionGuardada = {
  version: number;
  /** true: el cambio ya está en el agente (aún no trabajaba). false: espera a certificarse y el agente sigue con su versión certificada. */
  aplicada: boolean;
  certificacion: EnvioCertificacion | null;
};

/** Tras guardar una versión de un agente que ya trabaja: se clasifica y se envía a certificación. Nunca deshace el guardado. */
async function enviarTrasGuardar(deps: DepsCiclo, e: { companyId: string; agentId: string; userId: string | null; tipo?: "plantilla" }): Promise<EnvioCertificacion> {
  try {
    const s = await enviarACertificacion(deps.db, e);
    deps.lanzarExamen?.(e.companyId, s.requestId);
    return { enviada: true, solicitudId: s.requestId, tipo: s.tipo, via: s.via, motivos: s.clasificacion.motivos };
  } catch (err) {
    if (err instanceof CertificacionError) return { enviada: false, motivo: err.message, ...(err.faltan ? { faltan: err.faltan } : {}) };
    throw err;
  }
}

async function guardarFoto(deps: DepsCiclo, e: { companyId: string; agentId: string; userId: string | null; config: ConfigVersion; motivo: string; versionEsperada: number; tipo?: "plantilla" }): Promise<VersionGuardada> {
  const { data, error } = await deps.db.rpc("agent_version_guardar", {
    p_company_id: e.companyId, p_agent_id: e.agentId, p_user_id: e.userId, p_snapshot: e.config, p_motivo: e.motivo, p_version_esperada: e.versionEsperada,
  });
  if (error) throw errorDeBase(error);
  const r = data as { version: number; aplicada: boolean; trabaja: boolean };
  return { version: r.version, aplicada: r.aplicada, certificacion: r.trabaja ? await enviarTrasGuardar(deps, e) : null };
}

/** Guarda los cambios como versión nueva. En un agente que ya trabaja, además la envía a certificación sin interrumpirlo. */
export async function guardarVersion(deps: DepsCiclo, e: { companyId: string; agentId: string; userId: string | null; cambios: CambiosVersion; motivo?: string; versionEsperada?: number }): Promise<VersionGuardada> {
  const { agente, config } = await ultimaConfiguracion(deps.db, e.companyId, e.agentId);
  if (e.versionEsperada !== undefined && e.versionEsperada !== agente.version_actual) throw new CicloError(409, "version_cambiada", "El agente ha cambiado mientras lo editabas. Recarga y vuelve a intentarlo.");
  const nueva = aplicarCambios(config, e.cambios);
  if (JSON.stringify(nueva) === JSON.stringify(config)) throw new CicloError(400, "sin_cambios", "No hay ningún cambio que guardar.");
  return guardarFoto(deps, { ...e, config: nueva, motivo: e.motivo?.trim() || "cambio de configuración", versionEsperada: agente.version_actual });
}

/**
 * Envía a certificación la última versión de un agente que ya trabaja si aún no se envió (p. ej. tras aplicar una propuesta del
 * asistente o guardar una corrección). No hace nada si el agente no trabaja todavía o si su última versión ya es la certificada.
 */
export async function certificarCambiosPendientes(deps: DepsCiclo, e: { companyId: string; agentId: string; userId: string | null }): Promise<EnvioCertificacion | null> {
  const a = await leerAgente(deps.db, e.companyId, e.agentId);
  if (!(ESTADOS_QUE_TRABAJAN as readonly string[]).includes(a.estado) || a.version_certificada === null || a.version_actual === a.version_certificada) return null;
  return enviarTrasGuardar(deps, e);
}

// ── Historial ────────────────────────────────────────────────────────────────────────────────────────
export type VersionVista = {
  version: number;
  motivo: string | null;
  creadaEn: string;
  autor: string | null;
  /** Es la última versión guardada. */
  esUltima: boolean;
  /** Es la versión con la que trabaja el agente ahora mismo. */
  trabaja: boolean;
  /** Fue certificada alguna vez (y hasta cuándo, si sigue vigente). */
  certificada: boolean;
  certificacionVigenteHasta: string | null;
  /** Lo que cambió respecto a la versión anterior. */
  diferencias: Diferencia[];
  /** Con «Volver a esta versión»: si se reactiva sin revisión (su certificación sigue vigente) o se envía a certificación. */
  alVolver: "reactivar" | "certificar" | "aplicar" | null;
};

export async function listarVersiones(db: SupabaseClient, companyId: string, agentId: string, ahora: Date = new Date()): Promise<{ versiones: VersionVista[]; versionActual: number; versionCertificada: number | null }> {
  const { agente } = await ultimaConfiguracion(db, companyId, agentId);   // garantiza que la versión actual tiene foto
  const [vs, certs, agentes] = await Promise.all([
    db.from("agent_versions").select("version, snapshot, motivo_cambio, created_by, creado_en").eq("company_id", companyId).eq("agent_id", agentId).order("version", { ascending: false }).limit(200),
    db.from("certifications").select("agent_version, caduca_en, estado").eq("company_id", companyId).eq("agent_id", agentId),
    db.from("agents").select("id, name").eq("company_id", companyId),
  ]);
  if (vs.error || certs.error || agentes.error) throw new Error("No se pudo leer el historial de versiones.");
  const autores = [...new Set((vs.data ?? []).map((v) => v.created_by as string | null).filter((x): x is string => !!x))];
  const { data: us } = autores.length ? await db.from("users").select("id, full_name").eq("company_id", companyId).in("id", autores) : { data: [] };
  const nombreDe = new Map((us ?? []).map((u) => [u.id as string, u.full_name as string]));
  const nombres = Object.fromEntries((agentes.data ?? []).map((a) => [a.id as string, a.name as string]));
  const filas = vs.data ?? [];
  const foto = new Map(filas.map((v) => [v.version as number, v.snapshot as ConfigVersion]));
  const trabajaYa = (ESTADOS_QUE_TRABAJAN as readonly string[]).includes(agente.estado) && agente.version_certificada !== null;
  const editable = !["en_certificacion", "suspendido", "archivado"].includes(agente.estado);

  const versiones = filas.map((v): VersionVista => {
    const n = v.version as number;
    const suyas = (certs.data ?? []).filter((c) => c.agent_version === n);
    const vigente = suyas.filter((c) => c.estado === "vigente" && new Date(c.caduca_en as string) > ahora).map((c) => c.caduca_en as string).sort().at(-1) ?? null;
    return {
      version: n, motivo: (v.motivo_cambio as string | null) ?? null, creadaEn: v.creado_en as string, autor: v.created_by ? nombreDe.get(v.created_by as string) ?? null : null,
      esUltima: n === agente.version_actual, trabaja: trabajaYa ? n === agente.version_certificada : n === agente.version_actual,
      certificada: suyas.length > 0, certificacionVigenteHasta: vigente,
      diferencias: diferenciasEntre(foto.get(n - 1) ?? null, v.snapshot as ConfigVersion, nombres),
      alVolver: !editable || n === agente.version_actual ? null : vigente ? "reactivar" : trabajaYa ? "certificar" : "aplicar",
    };
  });
  return { versiones, versionActual: agente.version_actual, versionCertificada: agente.version_certificada };
}

export type VersionRestaurada = VersionGuardada & { desde: number; reactivada: boolean };

/** «Volver a esta versión»: versión nueva igual a la antigua; se reactiva si seguía certificada, o se envía a certificación. */
export async function restaurarVersion(deps: DepsCiclo, e: { companyId: string; agentId: string; userId: string | null; version: number }): Promise<VersionRestaurada> {
  const { data, error } = await deps.db.rpc("agent_version_restaurar", { p_company_id: e.companyId, p_agent_id: e.agentId, p_user_id: e.userId, p_version: e.version });
  if (error) throw errorDeBase(error);
  const r = data as { version: number; aplicada: boolean; trabaja: boolean; reactivada: boolean; desde: number };
  const certificacion = r.reactivada || !r.trabaja ? null : await enviarTrasGuardar(deps, e);
  return { version: r.version, aplicada: r.aplicada || r.reactivada, certificacion, desde: r.desde, reactivada: r.reactivada };
}

// ── Plantilla actualizada ────────────────────────────────────────────────────────────────────────────
type HerramientaDePlantilla = { id: string; permiso_defecto: ConfigVersion["herramientas"][number]["permiso"]; editable?: boolean };
export type NovedadDePlantilla = { plantilla: string; versionDelAgente: number; versionNueva: number; novedades: string | null; cambios: string[] };

/** Pura: qué herramientas cambian entre dos versiones de una plantilla. */
export function cambiosDePlantilla(antes: HerramientaDePlantilla[], ahora: HerramientaDePlantilla[]): string[] {
  const a = new Map(antes.map((h) => [h.id, h])), b = new Map(ahora.map((h) => [h.id, h]));
  const out: string[] = [];
  for (const [id, h] of b) {
    const previa = a.get(id);
    if (!previa) out.push(`Herramienta nueva: «${id}» (${h.permiso_defecto}).`);
    else if (previa.permiso_defecto !== h.permiso_defecto) out.push(`«${id}» pasa de «${previa.permiso_defecto}» a «${h.permiso_defecto}» por defecto.`);
    else if (!!previa.editable !== !!h.editable) out.push(h.editable ? `Ahora puedes cambiar el permiso de «${id}».` : `El permiso de «${id}» ya no se puede cambiar.`);
  }
  for (const id of a.keys()) if (!b.has(id)) out.push(`Se retira la herramienta «${id}».`);
  return out;
}

/** Pura: las herramientas del agente tras actualizar a la plantilla nueva (conserva los permisos que la plantilla sigue permitiendo). */
export function herramientasTrasActualizar(actuales: ConfigVersion["herramientas"], plantilla: HerramientaDePlantilla[]): ConfigVersion["herramientas"] {
  const mias = new Map(actuales.map((t) => [t.tool_id, t]));
  return [...plantilla].sort((x, y) => x.id.localeCompare(y.id)).map((h) => {
    const mia = mias.get(h.id);
    const conserva = mia && (h.editable === true || mia.permiso === h.permiso_defecto);
    return { tool_id: h.id, permiso: conserva ? mia.permiso : h.permiso_defecto, limite_diario: mia?.limite_diario ?? null };
  });
}

async function plantillaNueva(db: SupabaseClient, agente: FilaAgente, config: ConfigVersion) {
  if (!agente.template_id) return null;
  const enUso = Math.max(agente.template_version ?? 0, config.plantilla_version ?? 0);
  const { data: t, error } = await db.from("agent_templates").select("id, version, novedades, herramientas_disponibles, activa").eq("id", agente.template_id).maybeSingle();
  if (error) throw new Error("No se pudo leer la plantilla.");
  if (!t || !t.activa || (t.version as number) <= enUso) return null;
  // Solo se ofrece una versión que IDESIE ya ha certificado.
  const cert = await db.rpc("plantilla_certificada", { p_template_id: agente.template_id, p_version: t.version });
  if (cert.error || cert.data !== true) return null;
  const { data: vieja } = await db.from("agent_template_versions").select("herramientas_disponibles").eq("template_id", agente.template_id).eq("version", enUso).maybeSingle();
  return { enUso, fila: t, herramientasAntes: ((vieja?.herramientas_disponibles as HerramientaDePlantilla[] | null) ?? []), herramientasAhora: ((t.herramientas_disponibles as HerramientaDePlantilla[] | null) ?? []) };
}

/** «Hay una versión nueva de la plantilla»: null si el agente no viene de plantilla o ya está al día. */
export async function novedadDePlantilla(db: SupabaseClient, companyId: string, agentId: string): Promise<NovedadDePlantilla | null> {
  const { agente, config } = await ultimaConfiguracion(db, companyId, agentId);
  const p = await plantillaNueva(db, agente, config);
  if (!p) return null;
  return {
    plantilla: p.fila.id as string, versionDelAgente: p.enUso, versionNueva: p.fila.version as number, novedades: ((p.fila.novedades as string | null) ?? "").trim() || null,
    cambios: cambiosDePlantilla(p.herramientasAntes, p.herramientasAhora),
  };
}

/** Botón «Actualizar»: versión nueva del agente con la plantilla nueva; en un agente que trabaja, a certificación por la vía rápida. */
export async function actualizarPlantilla(deps: DepsCiclo, e: { companyId: string; agentId: string; userId: string | null }): Promise<VersionGuardada & { versionDePlantilla: number }> {
  const { agente, config } = await ultimaConfiguracion(deps.db, e.companyId, e.agentId);
  const p = await plantillaNueva(deps.db, agente, config);
  if (!p) throw new CicloError(409, "plantilla_al_dia", "Este agente ya usa la última versión certificada de su plantilla.");
  const version = p.fila.version as number;
  const nueva: ConfigVersion = { ...config, plantilla_version: version, herramientas: herramientasTrasActualizar(config.herramientas, p.herramientasAhora) };
  const r = await guardarFoto(deps, { ...e, config: nueva, motivo: `actualización a la versión ${version} de la plantilla`, versionEsperada: agente.version_actual, tipo: "plantilla" });
  return { ...r, versionDePlantilla: version };
}

// ── Estado del agente ────────────────────────────────────────────────────────────────────────────────
export type AccionDeEstado = "activar" | "pausar" | "archivar";

/** Activar (solo certificado), pausar (las tareas en curso terminan; las nuevas no se lanzan) o archivar. Devuelve el estado nuevo. */
export async function cambiarEstado(db: SupabaseClient, e: { companyId: string; agentId: string; accion: AccionDeEstado | "probar" }): Promise<string> {
  const { data, error } = await db.rpc("agente_cambiar_estado", { p_company_id: e.companyId, p_agent_id: e.agentId, p_accion: e.accion });
  if (error) throw errorDeBase(error);
  return data as string;
}

export async function cancelarSolicitud(db: SupabaseClient, e: { companyId: string; agentId: string }): Promise<void> {
  const { data } = await db.from("certification_requests").select("id").eq("company_id", e.companyId).eq("agent_id", e.agentId).in("estado", ABIERTAS).maybeSingle();
  if (!data) throw new CicloError(404, "sin_solicitud", "Este agente no tiene ninguna solicitud de certificación en curso.");
  const { error } = await db.rpc("certificacion_cancelar", { p_company_id: e.companyId, p_request_id: data.id });
  if (error) throw errorDeBase(error);
}

export type CicloDelAgente = {
  estado: string;
  pausadoMotivo: string | null;
  versionActual: number;
  versionCertificada: number | null;
  certificadoHasta: string | null;
  /** Hay una versión posterior a la certificada esperando certificación (o por enviar). */
  cambiosPendientes: boolean;
  solicitud: { id: string; tipo: string; via: string; estado: string; version: number; motivos: string[]; comentario: string | null; enviadaEn: string } | null;
  /** Lo que falta para poder enviar a certificación (vacío = nada). */
  faltan: Requisito[];
  plantillaNueva: NovedadDePlantilla | null;
  acciones: { enviarACertificacion: boolean; activar: boolean; pausar: boolean; cancelarSolicitud: boolean };
};

/** Todo lo que la ficha del agente necesita para pintar su ciclo de vida. */
export async function cicloDelAgente(db: SupabaseClient, companyId: string, agentId: string, ahora: Date = new Date()): Promise<CicloDelAgente> {
  const a = await leerAgente(db, companyId, agentId);
  const [sol, faltan, plantilla] = await Promise.all([
    db.from("certification_requests").select("id, tipo, via, estado, agent_version, motivos, comentario_empresa, enviado_en").eq("company_id", companyId).eq("agent_id", agentId).order("enviado_en", { ascending: false }).limit(1).maybeSingle(),
    requisitosParaCertificar(db, companyId, agentId),
    novedadDePlantilla(db, companyId, agentId),
  ]);
  const s = sol.data;
  const abierta = !!s && ABIERTAS.includes(s.estado as string);
  const trabaja = (ESTADOS_QUE_TRABAJAN as readonly string[]).includes(a.estado);
  const cambiosPendientes = trabaja && a.version_certificada !== null && a.version_actual !== a.version_certificada;
  const vigente = !!a.certificado_hasta && new Date(a.certificado_hasta) > ahora;
  return {
    estado: a.estado, pausadoMotivo: a.pausado_motivo, versionActual: a.version_actual, versionCertificada: a.version_certificada, certificadoHasta: a.certificado_hasta,
    cambiosPendientes,
    solicitud: s ? { id: s.id as string, tipo: s.tipo as string, via: s.via as string, estado: s.estado as string, version: s.agent_version as number, motivos: (s.motivos as string[] | null) ?? [], comentario: (s.comentario_empresa as string | null) ?? null, enviadaEn: s.enviado_en as string } : null,
    faltan: faltan ?? [],
    plantillaNueva: plantilla,
    acciones: {
      enviarACertificacion: !abierta && (["en_pruebas", "rechazado"].includes(a.estado) || cambiosPendientes),
      activar: ["certificado", "pausado"].includes(a.estado) && vigente,
      pausar: a.estado === "activo",
      cancelarSolicitud: abierta,
    },
  };
}
