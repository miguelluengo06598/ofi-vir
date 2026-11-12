/**
 * Procesado de los leads de Meta Lead Ads, DESPUÉS de registrar el aviso del webhook. SOLO SERVIDOR.
 *
 * Por cada aviso pendiente (reclamado de forma atómica con `meta_lead_reclamar`):
 *  1. Empresa por page_id; sin página conectada y marcada, o con el formulario desmarcado → `ignorado` con su motivo.
 *  2. Lead de prueba sin «quiero ver al agente en acción» → `procesado` sin contacto ni tarea (no gasta créditos).
 *  3. `GET /{leadgen_id}` con el token de la página (y los datos del anuncio si hay permiso).
 *  4. Normaliza (nombre, correo, teléfono internacional, preguntas, consentimientos) y crea o actualiza el contacto sin
 *     duplicar por correo ni teléfono (`meta_lead_contacto`), con su recuerdo externo en la memoria.
 *  5. Tarea `evento_externo` para el agente del formulario (o de la página) por `recibirEvento` (filtro de eventos) y
 *     comprobación de la puerta (`puedeEjecutarse`: créditos, certificación, oficina pausada). Si no puede trabajar, el
 *     lead queda guardado y se avisa a la empresa.
 *  6. Aviso «Nuevo lead de Facebook: … (formulario …)».
 * Si Meta o la base fallan: reintento con espera creciente; tras MAX_INTENTOS, `error`, aviso a la empresa y alerta en
 * la oficina de MyOfia (Sistema). Los registros llevan ids y códigos, nunca datos del lead.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AgentStore } from "../../agents/store.ts";
import { puedeEjecutarse, type DepsPuerta } from "../../agents/puerta.ts";
import { recibirEvento, type AlmacenEventos } from "../../eventos/servicio.ts";
import type { Env } from "../proveedores.ts";
import { ErrorDeMeta, graph } from "./graph.ts";
import { LeadDeMeta, normalizarLead, textoParaAgente, type LeadNormalizado } from "./normalizar.ts";
import { agentePorDefecto } from "./servicio.ts";

if (typeof window !== "undefined") throw new Error("src/lib/integraciones/meta/leads.ts es solo para el servidor.");

export const MAX_INTENTOS = 5;
/** Espera antes de cada reintento (tras el 1.º, 2.º… fallo): 1 min, 5 min, 30 min, 2 h. */
export const ESPERAS_MS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 3600_000];
const CAMPOS_LEAD = "id,created_time,form_id,ad_id,field_data,custom_disclaimer_responses,platform,is_organic";
const CAMPOS_ANUNCIO = ",ad_name,adset_name,campaign_id,campaign_name";

export type DepsLeadsMeta = {
  db: SupabaseClient;
  env: Env;
  fetch: typeof fetch;
  ahora: () => Date;
  log: Pick<Console, "info" | "warn" | "error">;
  store: Pick<AgentStore, "createTask" | "aplazarTarea" | "getAgent" | "getTask" | "cadenaDeTarea" | "controlDeEjecucion">;
  eventos: AlmacenEventos;
  /** Comprobaciones de la puerta sin el almacén (que sale de `store`). */
  puerta: Omit<DepsPuerta, "store">;
  /** Ejecuta la cola de tareas de esa empresa (motor de agentes). Sin él, las tareas esperan al cron `procesar-pendientes`. */
  ejecutarCola?: (companyId: string) => Promise<unknown>;
};

type Evento = { id: string; page_id: string; form_id: string | null; leadgen_id: string; company_id: string | null; es_prueba: boolean; intentos: number };
type Pagina = { id: string; nombre: string; estado: string; suscrita: boolean; agent_id: string | null; pruebas_como_reales: boolean };
export type ResultadoLead = { id: string; estado: "procesado" | "ignorado" | "reintento" | "error"; motivo: string | null; taskId: string | null };

/** Fallo que no se arregla reintentando (permiso retirado, lead sin forma de contacto…). */
class Definitivo extends Error {
  readonly codigo: string;
  constructor(codigo: string) { super(codigo); this.codigo = codigo; }
}

export async function procesarLeadsMeta(d: DepsLeadsMeta, o: { limite?: number } = {}): Promise<{ resultados: ResultadoLead[] }> {
  const { data, error } = await d.db.rpc("meta_lead_reclamar", { p_limite: o.limite ?? 20, p_segundos: 180 });
  if (error) throw new Error(`meta_lead_reclamar: ${error.code ?? "error"}`);
  const resultados: ResultadoLead[] = [];
  const conTareas = new Set<string>();
  for (const ev of (data ?? []) as Evento[]) {
    const r = await procesarUno(d, ev);
    resultados.push(r);
    if (r.taskId && ev.company_id) conTareas.add(ev.company_id);
  }
  // Que el agente empiece ya (si hay motor); si no, lo recoge el cron `procesar-pendientes`.
  for (const companyId of conTareas) {
    try { await d.ejecutarCola?.(companyId); } catch (e) { d.log.warn(`[meta] la cola de la empresa ${companyId} no se pudo ejecutar ahora (${e instanceof Error ? e.name : "error"}); la recogerá el cron.`); }
  }
  if (resultados.length) d.log.info(`[meta] leads: ${resultados.map((r) => r.estado).join(", ")}`);
  return { resultados };
}

const terminar = (d: DepsLeadsMeta, id: string, estado: string, codigo: string | null, extra: { contactId?: string | null; taskId?: string | null; proximo?: Date | null } = {}) =>
  d.db.rpc("meta_lead_resultado", { p_id: id, p_estado: estado, p_error: codigo, p_proximo: extra.proximo?.toISOString() ?? null, p_contact_id: extra.contactId ?? null, p_task_id: extra.taskId ?? null });

async function procesarUno(d: DepsLeadsMeta, ev: Evento): Promise<ResultadoLead> {
  const ignorar = async (motivo: string): Promise<ResultadoLead> => { await terminar(d, ev.id, "ignorado", motivo); return { id: ev.id, estado: "ignorado", motivo, taskId: null }; };
  try {
    if (!ev.company_id) return ignorar("pagina_sin_oficina");
    const companyId = ev.company_id;
    const { data: pag } = await d.db.from("meta_pages").select("id, nombre, estado, suscrita, agent_id, pruebas_como_reales").eq("company_id", companyId).eq("page_id", ev.page_id).neq("estado", "desconectada").maybeSingle();
    const pagina = pag as Pagina | null;
    if (!pagina || pagina.estado !== "activa" || !pagina.suscrita) return ignorar("pagina_sin_marcar");
    const { data: form } = ev.form_id
      ? await d.db.from("meta_forms").select("nombre, activo, agent_id").eq("company_id", companyId).eq("form_id", ev.form_id).maybeSingle()
      : { data: null };
    if (form && form.activo === false) return ignorar("formulario_desmarcado");
    if (ev.es_prueba && !pagina.pruebas_como_reales) {
      await terminar(d, ev.id, "procesado", "prueba_sin_tratar");
      return { id: ev.id, estado: "procesado", motivo: "prueba_sin_tratar", taskId: null };
    }

    const lead = await pedirLead(d, companyId, pagina, ev.leadgen_id);
    const l = normalizarLead(lead);
    if (!l.email && !l.telefono) throw new Definitivo("lead_sin_contacto");
    const formulario = (form?.nombre as string | undefined) ?? null;
    const agentId = (form?.agent_id as string | null) ?? pagina.agent_id ?? (await agentePorDefecto(d.db, companyId));
    const agente = agentId ? await d.store.getAgent(companyId, agentId) : null;
    const nombre = l.nombre ?? l.email ?? l.telefono ?? "Contacto de Facebook";

    const { data: con, error: errCon } = await d.db.rpc("meta_lead_contacto", {
      p_company_id: companyId, p_agent_id: agente?.id ?? null, p_nombre: nombre, p_email: l.email, p_telefono: l.telefono,
      p_lead: entradaDelContacto(ev, l, formulario),
      p_titulo: `Lead de Facebook${formulario ? ` · ${formulario}` : ""} · ${ev.leadgen_id}`,
      p_resumen: textoParaAgente(l, formulario),
    });
    if (errCon) {
      if (/LEAD_SIN_CONTACTO/.test(errCon.message ?? "")) throw new Definitivo("lead_sin_contacto");
      throw new Error(`meta_lead_contacto: ${errCon.code ?? "error"}`);
    }
    const contactId = (con as { contact_id: string }).contact_id;

    let taskId: string | null = null;
    if (!agente) {
      await avisar(d.db, companyId, "lead_meta_sin_atender", `Lead de Facebook sin atender: ${nombre}`,
        "Hemos guardado el contacto, pero tu oficina no tiene ningún agente para atender los leads de Facebook. Elige uno en Conexiones → Facebook.", { contacto_id: contactId });
    } else {
      const r = await recibirEvento({ eventos: d.eventos, store: d.store, ahora: d.ahora() }, {
        companyId, canal: "meta_lead", clave: ev.leadgen_id, remitente: l.email ?? l.telefono!, agentId: agente.id, model: agente.model,
        titulo: `Lead de Facebook: ${nombre}`, contenido: textoParaAgente(l, formulario), contactId,
      });
      taskId = r.taskId;
      if (taskId && r.decision.estado !== "agrupado") await comprobarPuerta(d, companyId, taskId, contactId, agente.name, nombre);
    }

    await avisar(d.db, companyId, "lead_meta_nuevo", `Nuevo lead de Facebook: ${nombre}${formulario ? ` (formulario ${formulario})` : ""}`,
      agente ? `${agente.name} se encarga.` : "Está guardado en tus contactos.", { contacto_id: contactId, tarea_id: taskId, prueba: ev.es_prueba });
    await terminar(d, ev.id, "procesado", ev.es_prueba ? "prueba_tratada_como_real" : null, { contactId, taskId });
    return { id: ev.id, estado: "procesado", motivo: null, taskId };
  } catch (e) {
    return fallo(d, ev, e);
  }
}

/** Lo que se guarda en el contacto: respuestas tal cual, consentimientos y de dónde viene. Sin identificadores internos. */
function entradaDelContacto(ev: Evento, l: LeadNormalizado, formulario: string | null) {
  return {
    leadgen_id: ev.leadgen_id, origen: "Meta Lead Ads", formulario, campana: l.campana, anuncio: l.anuncio, plataforma: l.plataforma,
    creado_en: l.creadoEn, respuestas: l.respuestas, consentimientos: l.consentimientos, telefono_original: l.telefonoOriginal, prueba: ev.es_prueba,
  };
}

/** El lead con el token de la página. Si no hay permiso para los datos del anuncio, se pide sin ellos. */
async function pedirLead(d: DepsLeadsMeta, companyId: string, pagina: Pagina, leadgenId: string): Promise<LeadDeMeta> {
  const { data: token } = await d.db.rpc("meta_pagina_token", { p_company_id: companyId, p_id: pagina.id });
  if (typeof token !== "string" || !token) throw new Definitivo("permiso_caducado");
  const pedir = (campos: string) => graph<unknown>(d, leadgenId, { token, params: { fields: campos } });
  let bruto: unknown;
  try {
    bruto = await pedir(CAMPOS_LEAD + CAMPOS_ANUNCIO);
  } catch (e) {
    if (!(e instanceof ErrorDeMeta) || e.tipo !== "permiso") throw traducir(d, companyId, pagina, e);
    try { bruto = await pedir(CAMPOS_LEAD); } catch (e2) { throw traducir(d, companyId, pagina, e2); }
  }
  const v = LeadDeMeta.safeParse(bruto);
  if (!v.success) throw new Definitivo("respuesta_no_valida");
  return v.data;
}

/** Un permiso retirado o caducado no se arregla reintentando: se marca la página para que la empresa lo vea. */
function traducir(d: DepsLeadsMeta, companyId: string, pagina: Pagina, e: unknown): Error {
  if (!(e instanceof ErrorDeMeta)) return e instanceof Error ? e : new Error("error");
  if (e.tipo === "token") {
    void d.db.rpc("meta_pagina_actualizar", { p_company_id: companyId, p_id: pagina.id, p_estado: "token_caducado", p_suscrita: false, p_error: "permiso_caducado" });
    return new Definitivo("permiso_caducado");
  }
  if (e.tipo === "permiso") {
    void d.db.rpc("meta_pagina_actualizar", { p_company_id: companyId, p_id: pagina.id, p_estado: "sin_permiso_leads", p_suscrita: false, p_error: "acceso_leads" });
    return new Definitivo("acceso_leads");
  }
  return e; // temporal, límite u otro: se reintenta
}

/** La puerta de ejecución, ahora: si el agente no podrá trabajar (créditos, certificación, pausa), se avisa ya. */
async function comprobarPuerta(d: DepsLeadsMeta, companyId: string, taskId: string, contactId: string, agente: string, nombre: string) {
  try {
    const tarea = await d.store.getTask(companyId, taskId);
    if (!tarea) return;
    const decision = await puedeEjecutarse({ ...d.puerta, store: d.store }, companyId, tarea, "inicio");
    if (decision.ok) return;
    await avisar(d.db, companyId, "lead_meta_sin_atender", `Lead de Facebook en espera: ${nombre}`,
      `Hemos guardado el contacto, pero ${agente} no puede atenderlo ahora: ${decision.motivo}${decision.transitorio ? " Se atenderá en cuanto se pueda." : ""}`,
      { contacto_id: contactId, tarea_id: taskId, codigo: decision.codigo });
  } catch (e) {
    d.log.warn(`[meta] no se pudo comprobar la puerta de la tarea ${taskId} (${e instanceof Error ? e.name : "error"}).`);
  }
}

async function fallo(d: DepsLeadsMeta, ev: Evento, e: unknown): Promise<ResultadoLead> {
  const definitivo = e instanceof Definitivo;
  const codigo = definitivo ? e.codigo : e instanceof ErrorDeMeta ? `meta_${e.tipo}` : "error_interno";
  d.log.warn(`[meta] lead ${ev.id} (intento ${ev.intentos}): ${codigo}${e instanceof ErrorDeMeta || definitivo ? "" : ` (${e instanceof Error ? e.message.slice(0, 120) : "error"})`}.`);
  if (!definitivo && ev.intentos < MAX_INTENTOS) {
    const proximo = new Date(d.ahora().getTime() + ESPERAS_MS[Math.min(ev.intentos - 1, ESPERAS_MS.length - 1)]);
    await terminar(d, ev.id, "recibido", codigo, { proximo });
    return { id: ev.id, estado: "reintento", motivo: codigo, taskId: null };
  }
  await terminar(d, ev.id, "error", codigo);
  if (ev.company_id) {
    await avisar(d.db, ev.company_id, "lead_meta_error", "No hemos podido recoger un lead de Facebook", explicarFallo(codigo), { evento_id: ev.id, codigo });
    await d.db.from("internal_alerts").insert({ tipo: "error_sistema", company_id: ev.company_id, detalle: { origen: "meta_lead_ads", evento_id: ev.id, codigo, intentos: ev.intentos } });
  }
  return { id: ev.id, estado: "error", motivo: codigo, taskId: null };
}

function explicarFallo(codigo: string): string {
  if (codigo === "permiso_caducado") return "El permiso de Facebook ha caducado: vuelve a conectar en Conexiones → Facebook. El lead sigue en Facebook y podrás descargarlo desde allí.";
  if (codigo === "acceso_leads") return "Tu página limita el acceso a los clientes potenciales: da acceso a MyOfia en la configuración de acceso a clientes potenciales de tu Business Manager.";
  if (codigo === "lead_sin_contacto") return "El lead no trae ni correo ni teléfono válidos, así que no hemos podido crear el contacto. Puedes verlo en Facebook.";
  return "Facebook no respondió tras varios intentos. Nuestro equipo ya está avisado; el lead sigue en Facebook y podrás descargarlo desde allí.";
}

/** Un aviso que no se puede guardar no deshace el lead (ya está el contacto y la tarea): se anota y se sigue. */
async function avisar(db: SupabaseClient, companyId: string, tipo: string, titulo: string, cuerpo: string, metadatos: Record<string, unknown>) {
  const { error } = await db.from("notifications").insert({ company_id: companyId, tipo, titulo: titulo.slice(0, 200), cuerpo: cuerpo.slice(0, 1000), metadatos });
  if (error) console.warn(`[meta] no se pudo guardar el aviso ${tipo} de la empresa ${companyId} (${error.code ?? "error"}).`);
}

/** Dependencias reales a partir del entorno. null si falta la base. Sin clave de Claude, las tareas esperan al cron. */
export async function depsLeadsDesdeEntorno(env: Env = process.env): Promise<DepsLeadsMeta | null> {
  const url = env.NEXT_PUBLIC_SUPABASE_URL, key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  const [{ createClient }, { SupabaseAgentStore }, { SupabaseAlmacenEventos }, { estadoDeOficina, oficinaPuedeEjecutar }, { motorDesdeEntorno }, { procesarTareasPendientes }] = await Promise.all([
    import("@supabase/supabase-js"), import("../../agents/supabaseStore.ts"), import("../../eventos/servicio.ts"), import("../../creditos/rutinas.ts"),
    import("../../agents/fromEnv.ts"), import("../../agentes/traspasos/procesar.ts"),
  ]);
  const db = createClient(url, key, { auth: { persistSession: false } });
  const store = SupabaseAgentStore.fromEnv();
  if (!store) return null;
  const motor = motorDesdeEntorno();
  return {
    db, env, fetch, ahora: () => new Date(), log: console, store, eventos: new SupabaseAlmacenEventos(db),
    puerta: {
      env,
      oficinaActiva: async (companyId) => oficinaPuedeEjecutar(await estadoDeOficina(db, companyId)),
      puedeTrabajar: async (companyId, agentId) => {
        const { data, error } = await db.rpc("agente_comprobar_trabajo", { p_company_id: companyId, p_agent_id: agentId });
        if (error) throw new Error("No se pudo comprobar la certificación del agente.");
        return data === true;
      },
    },
    ejecutarCola: motor ? (companyId) => procesarTareasPendientes(motor.deps, { companyId }) : undefined,
  };
}
