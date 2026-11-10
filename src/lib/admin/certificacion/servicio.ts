/**
 * Panel interno de certificación: cola de revisión, asignación, vista de una solicitud, decisión y métricas. SOLO SERVIDOR (clave de
 * servicio): quien llama ya ha comprobado que la persona es revisora (`sesionRevisor`).
 *
 * Qué ve un revisor de una empresa: la CONFIGURACIÓN de la versión enviada (ficha, herramientas, reglas, traspasos, correcciones,
 * títulos de las fuentes de conocimiento) y el informe del examen, que se hizo con datos ficticios. Nunca correos, contactos, memoria ni
 * el contenido del conocimiento de la empresa.
 */
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { diferenciasEntre, type Diferencia } from "../../agentes/versiones/diferencias.ts";
import { simularAgente, type ResultadoSimulacion } from "../../agentes/simulador/servicio.ts";
import { archivarCopias, cargarConfiguracion, prepararEmpresaDeExamen, type ConfigVersion } from "../../certificacion/clonar.ts";
import type { DepsExamen } from "../../certificacion/examen.ts";
import type { ResultadoBloque, ResultadoCaso } from "../../certificacion/tipos.ts";
import type { SesionRevisor } from "./acceso.ts";
import { CHECKLIST, DECISIONES, esperaDe, leerPlazos, type Decision, type Espera, type Plazos, type PuntoRevisado } from "./config.ts";
import { motivosSegundaOpinion } from "./sensibilidad.ts";

export class RevisionError extends Error {
  readonly status: number; readonly codigo: string;
  constructor(status: number, codigo: string, mensaje: string) { super(mensaje); this.status = status; this.codigo = codigo; }
}

const MENSAJES: Record<string, [number, string]> = {
  REVISOR_NO_VALIDO: [403, "No eres un revisor activo."],
  CATEGORIA_NO_ASIGNADA: [403, "No tienes asignada la categoría de este agente."],
  YA_ASIGNADA: [409, "Otra persona ya está revisando esta solicitud."],
  MISMO_REVISOR: [409, "La segunda opinión la tiene que dar otra persona."],
  SOLO_ADMIN: [403, "Las dos opiniones no coinciden: decide un administrador."],
  NO_DISPONIBLE: [409, "La solicitud ya no está en la cola de revisión."],
  NO_ASIGNADA: [403, "Coge la solicitud antes de decidir."],
  DECISION_INVALIDA: [400, "Decisión no válida."],
  COMENTARIO_OBLIGATORIO: [400, "Si no apruebas, el comentario para la empresa es obligatorio."],
  CHECKLIST_INVALIDA: [400, "La lista de comprobación tiene 9 puntos."],
  CHECKLIST_INCOMPLETA: [400, "No se puede aprobar con puntos de la lista sin cumplir."],
};
function errorDeBase(e: { code?: string; message: string }): RevisionError {
  const clave = /^[A-Z_]+(?=:)/.exec(e.message)?.[0] ?? "";
  const m = MENSAJES[clave];
  if (m) return new RevisionError(m[0], clave.toLowerCase(), m[1]);
  if (e.code === "P0002") return new RevisionError(404, "no_encontrada", "No existe esa solicitud.");
  if (e.code === "P0001") return new RevisionError(409, "no_permitido", e.message);
  return new RevisionError(500, "error_interno", "No se pudo completar la operación.");
}

// ── Cola ─────────────────────────────────────────────────────────────────────────────────────────────
export type FiltrosCola = { tipo?: string; via?: string; departamento?: string; empresa?: string };
export type FilaCola = {
  clase: "agente" | "plantilla";
  id: string;
  nombre: string;
  empresa: string | null; empresaId: string | null;
  departamento: string;   // tipo de departamento = categoría del revisor
  tipo: string; via: string; estado: string; version: number;
  enColaDesde: string; espera: Espera;
  asignadoA: string | null; asignadoNombre: string | null;
  primerRevisor: string | null;
  desacuerdo: boolean;
  /** Si la persona que mira puede cogerla, y si no, por qué. */
  puedeCoger: boolean; motivoNoCoger: string | null;
};
export type Cola = { enCola: FilaCola[]; asignadas: FilaCola[]; mias: FilaCola[]; empresas: { id: string; nombre: string }[]; plazos: Plazos };

function puedeCoger(f: Pick<FilaCola, "departamento" | "estado" | "asignadoA" | "primerRevisor" | "desacuerdo">, s: SesionRevisor, yaOpino: boolean): string | null {
  if (f.asignadoA) return "Ya está asignada.";
  if (!s.categorias.includes(f.departamento)) return "No tienes asignada esta categoría.";
  if (f.estado === "segunda_opinion") {
    if (f.primerRevisor === s.userId || yaOpino) return "Ya diste tu opinión: la segunda la da otra persona.";
    if (f.desacuerdo && s.rol !== "admin_samgple") return "Hay desacuerdo: decide un administrador.";
  }
  return null;
}

/** Solicitudes en revisión humana (agentes y plantillas), de la más antigua a la más reciente. */
export async function listarCola(db: SupabaseClient, sesion: SesionRevisor, filtros: FiltrosCola = {}, ahora: Date = new Date(), env: Record<string, string | undefined> = process.env): Promise<Cola> {
  const plazos = leerPlazos(env);
  const ABIERTAS = ["pendiente_revision", "en_revision", "segunda_opinion"];
  const [ag, pl, revs, misAg, misPl] = await Promise.all([
    db.from("certification_requests").select("id, company_id, agent_id, agent_version, tipo, via, estado, enviado_en, en_cola_desde, asignado_a, primer_revisor, desacuerdo").in("estado", ABIERTAS).order("en_cola_desde", { ascending: true }).limit(500),
    db.from("template_review_requests").select("id, template_id, template_version, tipo, estado, enviado_en, asignado_a, primer_revisor, desacuerdo").in("estado", ABIERTAS).order("enviado_en", { ascending: true }).limit(200),
    db.from("reviewers").select("user_id, nombre"),
    db.from("certification_reviews").select("request_id").eq("revisor_id", sesion.userId),
    db.from("template_reviews").select("request_id").eq("revisor_id", sesion.userId),
  ]);
  if (ag.error || pl.error) throw new Error("No se pudo leer la cola de revisión.");
  const nombreRev = new Map((revs.data ?? []).map((r) => [r.user_id as string, (r.nombre as string | null) ?? "Revisor"]));
  const opinadas = new Set([...(misAg.data ?? []), ...(misPl.data ?? [])].map((r) => r.request_id as string));

  const filasAg = ag.data ?? [];
  const idsAgentes = [...new Set(filasAg.map((r) => r.agent_id as string))];
  const idsEmpresas = [...new Set(filasAg.map((r) => r.company_id as string))];
  const [agentes, empresas, plantillas] = await Promise.all([
    idsAgentes.length ? db.from("agents").select("id, name, departments(tipo)").in("id", idsAgentes) : Promise.resolve({ data: [] as never[], error: null }),
    idsEmpresas.length ? db.from("companies").select("id, name").in("id", idsEmpresas) : Promise.resolve({ data: [] as never[], error: null }),
    db.from("agent_templates").select("id, nombre_por_defecto, departamento_tipo"),
  ]);
  const agente = new Map((agentes.data ?? []).map((a: Record<string, unknown>) => [a.id as string, { nombre: a.name as string, tipo: ((a.departments as { tipo?: string } | null)?.tipo ?? "personalizado") }]));
  const empresa = new Map((empresas.data ?? []).map((c: Record<string, unknown>) => [c.id as string, c.name as string]));
  const plantilla = new Map((plantillas.data ?? []).map((t) => [t.id as string, { nombre: t.nombre_por_defecto as string, tipo: t.departamento_tipo as string }]));

  const filas: FilaCola[] = [];
  const completar = (b: Omit<FilaCola, "espera" | "asignadoNombre" | "puedeCoger" | "motivoNoCoger">): FilaCola => {
    const motivo = puedeCoger(b, sesion, opinadas.has(b.id));
    return { ...b, espera: esperaDe(b.enColaDesde, b.via, ahora, plazos), asignadoNombre: b.asignadoA ? nombreRev.get(b.asignadoA) ?? "Revisor" : null, puedeCoger: motivo === null, motivoNoCoger: motivo };
  };
  for (const r of filasAg) {
    const a = agente.get(r.agent_id as string);
    filas.push(completar({
      clase: "agente", id: r.id as string, nombre: a?.nombre ?? "Agente", empresa: empresa.get(r.company_id as string) ?? null, empresaId: r.company_id as string,
      departamento: a?.tipo ?? "personalizado", tipo: r.tipo as string, via: r.via as string, estado: r.estado as string, version: r.agent_version as number,
      enColaDesde: (r.en_cola_desde as string | null) ?? (r.enviado_en as string), asignadoA: (r.asignado_a as string | null) ?? null, primerRevisor: (r.primer_revisor as string | null) ?? null, desacuerdo: r.desacuerdo as boolean,
    }));
  }
  for (const r of pl.data ?? []) {
    const t = plantilla.get(r.template_id as string);
    filas.push(completar({
      clase: "plantilla", id: r.id as string, nombre: `Plantilla ${t?.nombre ?? r.template_id}`, empresa: null, empresaId: null, departamento: t?.tipo ?? "personalizado",
      tipo: r.tipo as string, via: "completa", estado: r.estado as string, version: r.template_version as number, enColaDesde: r.enviado_en as string,
      asignadoA: (r.asignado_a as string | null) ?? null, primerRevisor: (r.primer_revisor as string | null) ?? null, desacuerdo: r.desacuerdo as boolean,
    }));
  }
  filas.sort((x, y) => x.enColaDesde.localeCompare(y.enColaDesde));
  const pasa = (f: FilaCola) =>
    (!filtros.tipo || f.tipo === filtros.tipo) && (!filtros.via || f.via === filtros.via) && (!filtros.departamento || f.departamento === filtros.departamento)
    && (!filtros.empresa || (filtros.empresa === "plantillas" ? f.clase === "plantilla" : f.empresaId === filtros.empresa));
  return {
    plazos,
    // La cola: pendientes de revisión y de segunda opinión, sin asignar.
    enCola: filas.filter((f) => !f.asignadoA && (f.estado === "pendiente_revision" || f.estado === "segunda_opinion")).filter(pasa),
    asignadas: filas.filter((f) => f.asignadoA && f.asignadoA !== sesion.userId).filter(pasa),
    mias: filas.filter((f) => f.asignadoA === sesion.userId),
    empresas: [...empresa].map(([id, nombre]) => ({ id, nombre })).sort((a, b) => a.nombre.localeCompare(b.nombre)),
  };
}

// ── Asignación ───────────────────────────────────────────────────────────────────────────────────────
export async function tomarSolicitud(db: SupabaseClient, sesion: SesionRevisor, e: { clase: "agente" | "plantilla"; id: string }): Promise<string> {
  const { data, error } = await db.rpc(e.clase === "agente" ? "revision_tomar" : "plantilla_revision_tomar", { p_request_id: e.id, p_revisor: sesion.userId });
  if (error) throw errorDeBase(error);
  if (e.clase === "agente") {
    // Se deja anotado desde ya por qué necesitará segunda opinión (lo decide el código, no el revisor).
    const motivos = await motivosDe(db, e.id).catch(() => null);
    if (motivos) await db.from("certification_requests").update({ segunda_opinion_motivos: motivos }).eq("id", e.id).eq("estado", "en_revision");
  }
  return data as string;
}

export async function soltarSolicitud(db: SupabaseClient, sesion: SesionRevisor, e: { clase: "agente" | "plantilla"; id: string }): Promise<void> {
  if (e.clase === "plantilla") {
    const { data } = await db.from("template_review_requests").update({ asignado_a: null, asignado_en: null }).eq("id", e.id).eq("asignado_a", sesion.userId).in("estado", ["en_revision", "segunda_opinion"]).select("id, estado");
    if (!data?.length) throw new RevisionError(403, "no_asignada", "Esta solicitud no la tienes asignada.");
    if (data[0]!.estado === "en_revision") await db.from("template_review_requests").update({ estado: "pendiente_revision" }).eq("id", e.id);
    return;
  }
  const { error } = await db.rpc("revision_soltar", { p_request_id: e.id, p_revisor: sesion.userId });
  if (error) throw errorDeBase(error);
}

async function configDe(db: SupabaseClient, requestId: string) {
  const { data: r } = await db.from("certification_requests").select("company_id, agent_id, agent_version").eq("id", requestId).maybeSingle();
  if (!r) throw new RevisionError(404, "no_encontrada", "No existe esa solicitud.");
  return cargarConfiguracion(db, r.company_id as string, r.agent_id as string, r.agent_version as number);
}
const motivosDe = async (db: SupabaseClient, requestId: string) => motivosSegundaOpinion((await configDe(db, requestId)).config);

// ── Decisión ─────────────────────────────────────────────────────────────────────────────────────────
export type EntradaDecision = { clase: "agente" | "plantilla"; id: string; decision: Decision; checklist: PuntoRevisado[]; comentario?: string; notas?: string };

/** Pura: la lista completa y ordenada de 9 puntos, o el motivo por el que no vale. */
export function validarChecklist(c: PuntoRevisado[]): PuntoRevisado[] | string {
  const porId = new Map(c.map((p) => [p.id, p]));
  if (porId.size !== c.length) return "Hay puntos repetidos en la lista de comprobación.";
  const lista: PuntoRevisado[] = [];
  for (const p of CHECKLIST) {
    const x = porId.get(p.id);
    if (!x || typeof x.ok !== "boolean") return `Falta marcar «${p.titulo}».`;
    lista.push({ id: p.id, ok: x.ok, ...(x.comentario?.trim() ? { comentario: x.comentario.trim().slice(0, 500) } : {}) });
  }
  return lista.length === c.length ? lista : "La lista de comprobación tiene puntos que no existen.";
}

/** Registra la revisión y devuelve el estado en que queda la solicitud (puede ser «segunda_opinion» si hace falta otra persona). */
export async function decidir(db: SupabaseClient, sesion: SesionRevisor, e: EntradaDecision): Promise<{ estado: string; segundaOpinion: boolean }> {
  if (!(DECISIONES as readonly string[]).includes(e.decision)) throw new RevisionError(400, "decision_invalida", "Decisión no válida.");
  const lista = validarChecklist(e.checklist);
  if (typeof lista === "string") throw new RevisionError(400, "checklist_invalida", lista);
  if (e.decision !== "aprobar" && !e.comentario?.trim()) throw new RevisionError(400, "comentario_obligatorio", MENSAJES.COMENTARIO_OBLIGATORIO![1]);
  if (e.decision === "aprobar" && lista.some((p) => !p.ok)) throw new RevisionError(400, "checklist_incompleta", MENSAJES.CHECKLIST_INCOMPLETA![1]);
  const comunes = { p_request_id: e.id, p_revisor: sesion.userId, p_decision: e.decision, p_checklist: lista, p_comentario: e.comentario ?? null, p_notas: e.notas ?? null };
  let r;
  if (e.clase === "plantilla") r = await db.rpc("plantilla_revision_decidir", comunes);
  else {
    const motivos = await motivosDe(db, e.id);
    r = await db.rpc("revision_decidir", { ...comunes, p_requiere_segunda: motivos.length > 0, p_motivos: motivos });
  }
  if (r.error) throw errorDeBase(r.error);
  return { estado: r.data as string, segundaOpinion: r.data === "segunda_opinion" };
}

// ── Vista de una solicitud de agente ─────────────────────────────────────────────────────────────────
export type RevisionHecha = { revisor: string; revisorId: string; rol: string; decision: string; comentario: string | null; notasInternas: string | null; checklist: PuntoRevisado[]; fecha: string };
export type DetalleSolicitud = {
  id: string; estado: string; tipo: string; via: string; version: number; resumen: string | null; motivos: string[];
  enviadaEn: string; espera: Espera;
  empresa: string; agente: { id: string; nombre: string; rol: string; departamento: string; categoria: string; estado: string; versionCertificada: number | null };
  asignadoA: string | null; asignadoNombre: string | null; esMia: boolean; puedeCoger: boolean; motivoNoCoger: string | null;
  primerRevisor: string | null; desacuerdo: boolean; activarAlAprobar: boolean;
  config: ConfigVersion;
  /** Instrucciones que usa hoy el motor real (`agents.instructions`): no forman parte de la foto de versión. */
  instruccionesDelMotor: string;
  plantilla: { id: string; version: number; nombre: string; instruccionesBase: string; queHace: string; queNoHace: string; herramientas: { id: string; permiso_defecto: string; editable?: boolean }[] } | null;
  traspasos: { destino: string; condicion: string; tipo: string; activo: boolean }[];
  conocimiento: { tipo: string; titulo: string; origen: string | null; estado: string; ambito: "agente" | "oficina" }[];
  diferencias: { desdeVersion: number; cambios: Diferencia[] } | null;
  examen: { resultado: string; notaGlobal: number | null; modelo: string; fecha: string; costeUsdMicros: number; bloques: ResultadoBloque[]; casos: ResultadoCaso[] } | null;
  /** Por qué necesitará segunda opinión si se aprueba (vacío = no la necesita; un rechazo la necesita siempre). */
  motivosSegundaOpinion: string[];
  revisiones: RevisionHecha[];
};

export async function detalleDeSolicitud(db: SupabaseClient, sesion: SesionRevisor, id: string, ahora: Date = new Date(), env: Record<string, string | undefined> = process.env): Promise<DetalleSolicitud | null> {
  const { data: r } = await db.from("certification_requests").select("*").eq("id", id).maybeSingle();
  if (!r) return null;
  const companyId = r.company_id as string, agentId = r.agent_id as string;
  const [emp, ag, exam, revs, revisores, conoc, agentes] = await Promise.all([
    db.from("companies").select("name, es_examen").eq("id", companyId).maybeSingle(),
    db.from("agents").select("id, name, role, estado, instructions, template_id, version_certificada, departments(name, tipo)").eq("id", agentId).maybeSingle(),
    db.from("certification_exams").select("resultado, nota_global, modelo_ia, bloques, casos, coste_ia_usd_micros, creado_en").eq("request_id", id).order("creado_en", { ascending: false }).limit(1).maybeSingle(),
    db.from("certification_reviews").select("revisor_id, rol, decision, comentario_para_empresa, notas_internas, checklist, creado_en").eq("request_id", id).order("creado_en"),
    db.from("reviewers").select("user_id, nombre"),
    db.from("agent_knowledge").select("tipo, titulo, origen, estado, agent_id").eq("company_id", companyId).or(`agent_id.eq.${agentId},agent_id.is.null`).order("creado_en"),
    db.from("agents").select("id, name").eq("company_id", companyId),
  ]);
  if (!ag.data || !emp.data) return null;
  const origen = await cargarConfiguracion(db, companyId, agentId, r.agent_version as number);
  const config = origen.config;
  const nombres = Object.fromEntries((agentes.data ?? []).map((a) => [a.id as string, a.name as string]));
  const nombreRev = new Map((revisores.data ?? []).map((x) => [x.user_id as string, (x.nombre as string | null) ?? "Revisor"]));

  let plantilla: DetalleSolicitud["plantilla"] = null;
  if (config.ficha.template_id) {
    const pv = config.plantilla_version ?? null;
    const [t, v] = await Promise.all([
      db.from("agent_templates").select("id, version, nombre_por_defecto, instrucciones_base, que_hace, que_no_hace, herramientas_disponibles").eq("id", config.ficha.template_id).maybeSingle(),
      pv !== null ? db.from("agent_template_versions").select("version, instrucciones_base, herramientas_disponibles").eq("template_id", config.ficha.template_id).eq("version", pv).maybeSingle() : Promise.resolve({ data: null }),
    ]);
    if (t.data) plantilla = {
      id: t.data.id as string, version: (v.data?.version as number | undefined) ?? (t.data.version as number), nombre: t.data.nombre_por_defecto as string,
      instruccionesBase: ((v.data?.instrucciones_base as string | undefined) ?? (t.data.instrucciones_base as string)), queHace: t.data.que_hace as string, queNoHace: t.data.que_no_hace as string,
      herramientas: ((v.data?.herramientas_disponibles ?? t.data.herramientas_disponibles) as DetalleSolicitud["plantilla"] extends infer P ? P extends { herramientas: infer H } ? H : never : never) ?? [],
    };
  }

  // Diferencias con la versión certificada anterior (si es un cambio).
  let diferencias: DetalleSolicitud["diferencias"] = null;
  const cert = ag.data.version_certificada as number | null;
  if (cert !== null && cert !== r.agent_version) {
    const { data: v } = await db.from("agent_versions").select("snapshot").eq("agent_id", agentId).eq("version", cert).maybeSingle();
    if (v) diferencias = { desdeVersion: cert, cambios: diferenciasEntre(v.snapshot as ConfigVersion, config, nombres) };
  }

  const dep = ag.data.departments as { name?: string; tipo?: string } | null;
  const categoria = dep?.tipo ?? "personalizado";
  const yaOpino = (revs.data ?? []).some((x) => x.revisor_id === sesion.userId);
  const base = { departamento: categoria, estado: r.estado as string, asignadoA: (r.asignado_a as string | null) ?? null, primerRevisor: (r.primer_revisor as string | null) ?? null, desacuerdo: r.desacuerdo as boolean };
  const abierta = ["pendiente_revision", "segunda_opinion"].includes(base.estado);
  const motivo = abierta ? puedeCoger(base, sesion, yaOpino) : "La solicitud no está en la cola.";
  return {
    id, estado: base.estado, tipo: r.tipo as string, via: r.via as string, version: r.agent_version as number, resumen: (r.resumen_cambios as string | null) ?? null, motivos: (r.motivos as string[] | null) ?? [],
    enviadaEn: r.enviado_en as string, espera: esperaDe((r.en_cola_desde as string | null) ?? (r.enviado_en as string), r.via as string, r.resuelto_en ? new Date(r.resuelto_en as string) : ahora, leerPlazos(env)),
    empresa: emp.data.name as string,
    agente: { id: agentId, nombre: config.ficha.nombre, rol: config.ficha.rol, departamento: dep?.name ?? "—", categoria, estado: ag.data.estado as string, versionCertificada: cert },
    asignadoA: base.asignadoA, asignadoNombre: base.asignadoA ? nombreRev.get(base.asignadoA) ?? "Revisor" : null, esMia: base.asignadoA === sesion.userId,
    puedeCoger: motivo === null, motivoNoCoger: motivo, primerRevisor: base.primerRevisor, desacuerdo: base.desacuerdo, activarAlAprobar: r.activar_al_aprobar as boolean,
    config, instruccionesDelMotor: ((ag.data.instructions as string | null) ?? "").trim(), plantilla,
    traspasos: config.traspasos.map((t) => ({ destino: nombres[t.agent_id_destino] ?? "Agente que ya no existe", condicion: t.condicion, tipo: t.tipo_traspaso, activo: t.activo })),
    conocimiento: (conoc.data ?? []).map((k) => ({ tipo: k.tipo as string, titulo: k.titulo as string, origen: (k.origen as string | null) ?? null, estado: k.estado as string, ambito: k.agent_id ? "agente" as const : "oficina" as const })),
    diferencias,
    examen: exam.data ? {
      resultado: exam.data.resultado as string, notaGlobal: exam.data.nota_global === null ? null : Number(exam.data.nota_global), modelo: exam.data.modelo_ia as string, fecha: exam.data.creado_en as string,
      costeUsdMicros: Number(exam.data.coste_ia_usd_micros), bloques: (exam.data.bloques as ResultadoBloque[] | null) ?? [], casos: (exam.data.casos as ResultadoCaso[] | null) ?? [],
    } : null,
    motivosSegundaOpinion: motivosSegundaOpinion(config),
    revisiones: (revs.data ?? []).map((x) => ({
      revisor: nombreRev.get(x.revisor_id as string) ?? "Revisor", revisorId: x.revisor_id as string, rol: x.rol as string, decision: x.decision as string,
      comentario: (x.comentario_para_empresa as string | null) ?? null, notasInternas: (x.notas_internas as string | null) ?? null, checklist: (x.checklist as PuntoRevisado[] | null) ?? [], fecha: x.creado_en as string,
    })),
  };
}

// ── Vista de una solicitud de plantilla ──────────────────────────────────────────────────────────────
export type DetallePlantilla = {
  id: string; estado: string; tipo: string; version: number; enviadaEn: string; espera: Espera;
  plantilla: { id: string; nombre: string; rol: string; categoria: string; descripcion: string; queHace: string; queNoHace: string; instruccionesBase: string; novedades: string | null; tipoTarea: string;
    herramientas: { id: string; permiso_defecto: string; editable?: boolean }[]; integraciones: string[] };
  cambiosDeHerramientas: string[] | null;
  agentesQueLaUsan: number;
  asignadoA: string | null; asignadoNombre: string | null; esMia: boolean; puedeCoger: boolean; motivoNoCoger: string | null; desacuerdo: boolean;
  revisiones: RevisionHecha[];
};

export async function detalleDePlantilla(db: SupabaseClient, sesion: SesionRevisor, id: string, ahora: Date = new Date(), env: Record<string, string | undefined> = process.env): Promise<DetallePlantilla | null> {
  const { data: r } = await db.from("template_review_requests").select("*").eq("id", id).maybeSingle();
  if (!r) return null;
  const [t, v, previa, revs, revisores, uso] = await Promise.all([
    db.from("agent_templates").select("id, nombre_por_defecto, rol, departamento_tipo, descripcion_publica, que_hace, que_no_hace, tipo_tarea_por_defecto").eq("id", r.template_id).maybeSingle(),
    db.from("agent_template_versions").select("instrucciones_base, herramientas_disponibles, integraciones_requeridas, novedades").eq("template_id", r.template_id).eq("version", r.template_version).maybeSingle(),
    db.from("agent_template_versions").select("herramientas_disponibles").eq("template_id", r.template_id).eq("version", (r.template_version as number) - 1).maybeSingle(),
    db.from("template_reviews").select("revisor_id, rol, decision, comentario, notas_internas, checklist, creado_en").eq("request_id", id).order("creado_en"),
    db.from("reviewers").select("user_id, nombre"),
    db.from("agents").select("id", { count: "exact", head: true }).eq("template_id", r.template_id).neq("estado", "archivado"),
  ]);
  if (!t.data || !v.data) return null;
  const { cambiosDePlantilla } = await import("../../agentes/versiones/servicio.ts");
  const nombreRev = new Map((revisores.data ?? []).map((x) => [x.user_id as string, (x.nombre as string | null) ?? "Revisor"]));
  const categoria = t.data.departamento_tipo as string;
  const base = { departamento: categoria, estado: r.estado as string, asignadoA: (r.asignado_a as string | null) ?? null, primerRevisor: (r.primer_revisor as string | null) ?? null, desacuerdo: r.desacuerdo as boolean };
  const motivo = ["pendiente_revision", "segunda_opinion"].includes(base.estado) ? puedeCoger(base, sesion, (revs.data ?? []).some((x) => x.revisor_id === sesion.userId)) : "La solicitud no está en la cola.";
  type H = DetallePlantilla["plantilla"]["herramientas"];
  const herramientas = (v.data.herramientas_disponibles as H | null) ?? [];
  return {
    id, estado: base.estado, tipo: r.tipo as string, version: r.template_version as number, enviadaEn: r.enviado_en as string,
    espera: esperaDe(r.enviado_en as string, "completa", r.resuelto_en ? new Date(r.resuelto_en as string) : ahora, leerPlazos(env)),
    plantilla: {
      id: t.data.id as string, nombre: t.data.nombre_por_defecto as string, rol: t.data.rol as string, categoria, descripcion: t.data.descripcion_publica as string, queHace: t.data.que_hace as string, queNoHace: t.data.que_no_hace as string,
      instruccionesBase: v.data.instrucciones_base as string, novedades: (v.data.novedades as string | null) ?? null, tipoTarea: t.data.tipo_tarea_por_defecto as string, herramientas, integraciones: (v.data.integraciones_requeridas as string[] | null) ?? [],
    },
    cambiosDeHerramientas: previa.data ? cambiosDePlantilla((previa.data.herramientas_disponibles as never) ?? [], herramientas as never) : null,
    agentesQueLaUsan: uso.count ?? 0,
    asignadoA: base.asignadoA, asignadoNombre: base.asignadoA ? nombreRev.get(base.asignadoA) ?? "Revisor" : null, esMia: base.asignadoA === sesion.userId, puedeCoger: motivo === null, motivoNoCoger: motivo, desacuerdo: base.desacuerdo,
    revisiones: (revs.data ?? []).map((x) => ({
      revisor: nombreRev.get(x.revisor_id as string) ?? "Revisor", revisorId: x.revisor_id as string, rol: x.rol as string, decision: x.decision as string,
      comentario: (x.comentario as string | null) ?? null, notasInternas: (x.notas_internas as string | null) ?? null, checklist: (x.checklist as PuntoRevisado[] | null) ?? [], fecha: x.creado_en as string,
    })),
  };
}

// ── Simulador del revisor ────────────────────────────────────────────────────────────────────────────
/**
 * El revisor prueba sus propios casos contra la versión ENVIADA, igual que el examen: en la empresa ficticia, con datos ficticios y en
 * simulación. No toca nada de la empresa real ni gasta sus créditos (el coste de IA lo asume la plataforma).
 */
export async function simularParaRevisor(deps: DepsExamen, e: { requestId: string; mensaje: string; canal: "whatsapp" | "correo" | "interno" }): Promise<ResultadoSimulacion> {
  const origen = await configDe(deps.db, e.requestId);
  const idCopia = randomUUID();
  const copia = await prepararEmpresaDeExamen(deps.db, deps.memoria, origen, idCopia, (m, err) => console.error(m, err instanceof Error ? err.message : err));
  try {
    return await simularAgente({ ...deps.sim, config: { ...deps.sim.config, gratisAlMes: Number.MAX_SAFE_INTEGER } }, { companyId: copia.companyId, agentId: copia.agentId, mensaje: e.mensaje, canal: e.canal, titulo: `Revisor: ${e.mensaje}` });
  } finally {
    await archivarCopias(deps.db, idCopia).catch(() => undefined);
  }
}

// ── Métricas del equipo ──────────────────────────────────────────────────────────────────────────────
export type Metricas = {
  semanas: { semana: string; recibidas: number; resueltas: number }[];
  resueltas: number; aprobadas: number; rechazadas: number; cambiosSolicitados: number;
  porcentajeAprobaciones: number | null;
  /** Horas laborables medias desde que entra en la cola hasta que se resuelve. */
  tiempoMedioHoras: number | null;
  dentroDePlazo: number | null;
  motivosDeRechazo: { id: string; titulo: string; veces: number }[];
  porRevisor: { nombre: string; revisiones: number }[];
};

const lunesDe = (d: Date) => { const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7)); return x.toISOString().slice(0, 10); };

export async function metricasDelEquipo(db: SupabaseClient, o: { semanas?: number; ahora?: Date; env?: Record<string, string | undefined> } = {}): Promise<Metricas> {
  const ahora = o.ahora ?? new Date(), n = o.semanas ?? 8;
  const desde = new Date(ahora.getTime() - n * 7 * 86_400_000);
  const plazos = leerPlazos(o.env ?? process.env);
  const { horasLaborables } = await import("./config.ts");
  // Solo lo que pasa por revisión humana (los cambios menores y de modelo se cierran con el examen).
  const [reqs, revs, revisores] = await Promise.all([
    db.from("certification_requests").select("id, via, estado, enviado_en, en_cola_desde, resuelto_en, companies!inner(es_examen)").eq("companies.es_examen", false).not("en_cola_desde", "is", null).gte("en_cola_desde", desde.toISOString()).limit(5000),
    db.from("certification_reviews").select("revisor_id, decision, checklist, creado_en").gte("creado_en", desde.toISOString()).limit(5000),
    db.from("reviewers").select("user_id, nombre"),
  ]);
  if (reqs.error || revs.error) throw new Error("No se pudieron calcular las métricas.");
  const semanas = new Map<string, { recibidas: number; resueltas: number }>();
  for (let i = n - 1; i >= 0; i--) semanas.set(lunesDe(new Date(ahora.getTime() - i * 7 * 86_400_000)), { recibidas: 0, resueltas: 0 });
  let aprobadas = 0, rechazadas = 0, cambios = 0, horas = 0, enPlazo = 0;
  for (const r of reqs.data ?? []) {
    const s = semanas.get(lunesDe(new Date(r.en_cola_desde as string)));
    if (s) s.recibidas++;
    if (!["aprobada", "rechazada", "cambios_solicitados"].includes(r.estado as string) || !r.resuelto_en) continue;
    const fin = semanas.get(lunesDe(new Date(r.resuelto_en as string)));
    if (fin) fin.resueltas++;
    if (r.estado === "aprobada") aprobadas++; else if (r.estado === "rechazada") rechazadas++; else cambios++;
    const h = horasLaborables(new Date(r.en_cola_desde as string), new Date(r.resuelto_en as string));
    horas += h;
    if (h <= (r.via === "rapida_plantilla" ? plazos.rapida_plantilla : plazos.completa)) enPlazo++;
  }
  const resueltas = aprobadas + rechazadas + cambios;
  const motivos = new Map<string, number>(), porRevisor = new Map<string, number>();
  for (const v of revs.data ?? []) {
    porRevisor.set(v.revisor_id as string, (porRevisor.get(v.revisor_id as string) ?? 0) + 1);
    if (v.decision === "aprobar") continue;
    for (const p of (v.checklist as PuntoRevisado[] | null) ?? []) if (p.ok === false) motivos.set(p.id, (motivos.get(p.id) ?? 0) + 1);
  }
  const nombreRev = new Map((revisores.data ?? []).map((x) => [x.user_id as string, (x.nombre as string | null) ?? "Revisor"]));
  return {
    semanas: [...semanas].map(([semana, v]) => ({ semana, ...v })),
    resueltas, aprobadas, rechazadas, cambiosSolicitados: cambios,
    porcentajeAprobaciones: resueltas ? Math.round((aprobadas / resueltas) * 1000) / 10 : null,
    tiempoMedioHoras: resueltas ? Math.round((horas / resueltas) * 10) / 10 : null,
    dentroDePlazo: resueltas ? Math.round((enPlazo / resueltas) * 1000) / 10 : null,
    motivosDeRechazo: CHECKLIST.map((p) => ({ id: p.id, titulo: p.titulo, veces: motivos.get(p.id) ?? 0 })).filter((m) => m.veces > 0).sort((a, b) => b.veces - a.veces),
    porRevisor: [...porRevisor].map(([id, revisiones]) => ({ nombre: nombreRev.get(id) ?? "Revisor", revisiones })).sort((a, b) => b.revisiones - a.revisiones),
  };
}
