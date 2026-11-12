/**
 * Meta Lead Ads: conexión con Facebook Login for Business, páginas, formularios, agente que atiende y pruebas. SOLO SERVIDOR.
 *
 *  - Los tokens (el de la persona y el de cada página) se guardan cifrados en Vault y NUNCA salen de aquí: ni en
 *    respuestas, ni en registros, ni en errores. Lo que se devuelve a la interfaz son nombres, estados y códigos.
 *  - Toda consulta va en el contexto de una empresa. Una página solo puede estar en una empresa a la vez (lo impone
 *    la base: `meta_pagina_conectar`); si la tiene otra, no se conecta y queda para revisión de MyOfia.
 *  - Los errores de Meta se guardan como CÓDIGOS (`permiso_caducado`, `acceso_leads`…); la interfaz los explica en
 *    lenguaje normal (`src/components/conexiones/meta/textos.ts`).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { obtenerProveedor, PERMISOS_META_LEADS } from "../proveedores.ts";
import { canjearCodigo, ConexionError, guardarConexion, type DepsConexiones } from "../servicio.ts";
import { ErrorDeMeta, graph, graphLista, tokenDeLargaDuracion } from "./graph.ts";

if (typeof window !== "undefined") throw new Error("src/lib/integraciones/meta/servicio.ts es solo para el servidor.");

export const PROVEEDOR_META = "meta_leads";
/** Sin estos no hay nada que hacer; los demás (datos del anuncio) solo dejan la conexión «con avisos». */
export const PERMISOS_IMPRESCINDIBLES = ["leads_retrieval", "pages_show_list", "pages_read_engagement", "pages_manage_metadata"] as const;
export const ENLACE_PRUEBA_DE_LEADS = "https://developers.facebook.com/tools/lead-ads-testing";
export const MINUTOS_DE_PRUEBA = 15;

const ID_META = /^[0-9]{1,32}$/;
const Uuid = z.uuid();

// ── 1) Callback: token de larga duración, permisos concedidos y páginas ───────────────────────────────────────────────
export type ResultadoConexionMeta = {
  resultado: "ok" | "faltan_permisos" | "sin_paginas";
  paginas: number;
  /** Páginas que ya están en otra oficina: no se han conectado y las revisa MyOfia. */
  enOtraOficina: number;
  faltan: string[];
};

export async function completarConexionMeta(
  d: DepsConexiones, e: { companyId: string; userId: string; state: string; code: string },
): Promise<ResultadoConexionMeta> {
  const { proveedor, token } = await canjearCodigo(d, { ...e, proveedorId: PROVEEDOR_META });

  let largo: string;
  let concedidos: string[];
  let cuenta: string | null = null;
  let idExterno: string | null = null;
  try {
    largo = await tokenDeLargaDuracion(d, token.access_token);
    const permisos = await graphLista<{ permission: string; status: string }>(d, "me/permissions", { token: largo });
    concedidos = permisos.filter((p) => p.status === "granted").map((p) => p.permission);
    const yo = await graph<{ id?: string; name?: string }>(d, "me", { token: largo, params: { fields: "id,name" } });
    cuenta = yo.name?.slice(0, 200) ?? null;
    // Id de la persona en esta app: lo usan los avisos de Facebook de desautorización y de eliminación de datos.
    idExterno = /^[0-9]{1,32}$/.test(yo.id ?? "") ? yo.id! : null;
  } catch (err) {
    d.log.warn(`[meta] no se pudo completar la conexión de la empresa ${e.companyId} (${err instanceof ErrorDeMeta ? err.message : "error"}).`);
    throw new ConexionError(502, "intercambio_fallido", "Facebook no aceptó la conexión. Inténtalo de nuevo.");
  }
  const faltan = PERMISOS_META_LEADS.filter((p) => !concedidos.includes(p));
  const faltaImprescindible = PERMISOS_IMPRESCINDIBLES.some((p) => faltan.includes(p));

  // El token de la persona dura ~60 días, pero no se renueva solo (caducaEn: null): los de página, que son los que
  // se usan a diario, no caducan. Si Meta lo invalida, la página queda «permiso_caducado» y hay que volver a conectar.
  const { conexionId } = await guardarConexion(d, {
    companyId: e.companyId, userId: e.userId, proveedor, accessToken: largo, scopes: concedidos.filter((p) => (PERMISOS_META_LEADS as readonly string[]).includes(p)),
    caducaEn: null, cuenta,
  });
  await anotarEnConexion(d.db, e.companyId, conexionId, faltan.length ? `faltan_permisos:${faltan.join(",")}` : null);
  if (idExterno) await d.db.from("company_connections").update({ id_externo: idExterno }).eq("company_id", e.companyId).eq("id", conexionId);
  if (faltaImprescindible) return { resultado: "faltan_permisos", paginas: 0, enOtraOficina: 0, faltan };

  let paginas: { id: string; name: string; access_token?: string; tasks?: string[] }[];
  try {
    paginas = await graphLista(d, "me/accounts", { token: largo, params: { fields: "id,name,access_token,tasks" } });
  } catch (err) {
    d.log.warn(`[meta] no se pudieron leer las páginas de la empresa ${e.companyId} (${err instanceof ErrorDeMeta ? err.message : "error"}).`);
    throw new ConexionError(502, "intercambio_fallido", "No hemos podido leer tus páginas de Facebook. Inténtalo de nuevo.");
  }

  let conectadas = 0, enOtraOficina = 0;
  const vistas = new Set<string>();
  for (const p of paginas) {
    if (!ID_META.test(p.id) || !p.access_token || !p.name) continue;
    vistas.add(p.id);
    const { data, error } = await d.db.rpc("meta_pagina_conectar", {
      p_company_id: e.companyId, p_connection_id: conexionId, p_user_id: e.userId, p_page_id: p.id, p_nombre: p.name, p_secreto: p.access_token,
    });
    if (error) { d.log.error(`[meta] no se pudo guardar una página de la empresa ${e.companyId} (${error.code ?? "error"}).`); continue; }
    const r = data as { ok: boolean; id?: string; motivo?: string };
    if (!r.ok) { enOtraOficina++; continue; }
    conectadas++;
    // Para leer leads hay que poder anunciar en la página: sin esa tarea, se avisa ya.
    if (p.tasks && !p.tasks.includes("ADVERTISE")) {
      await d.db.rpc("meta_pagina_actualizar", { p_company_id: e.companyId, p_id: r.id, p_estado: "sin_permiso_leads", p_suscrita: false, p_error: "no_puede_anunciar" });
    }
  }
  // Páginas que tenía esta oficina y la persona ya no ha autorizado: dejan de estar conectadas.
  const { data: previas } = await d.db.from("meta_pages").select("id, page_id").eq("company_id", e.companyId).neq("estado", "desconectada");
  for (const p of previas ?? []) {
    if (!vistas.has(p.page_id as string)) await d.db.rpc("meta_pagina_actualizar", { p_company_id: e.companyId, p_id: p.id, p_estado: "desconectada", p_suscrita: false, p_error: "ya_no_autorizada" });
  }
  await asignarAgentePorDefecto(d.db, e.companyId);
  d.log.info(`[meta] empresa ${e.companyId}: ${conectadas} página(s) conectada(s), ${enOtraOficina} en otra oficina.`);
  return { resultado: conectadas === 0 && enOtraOficina === 0 ? "sin_paginas" : "ok", paginas: conectadas, enOtraOficina, faltan };
}

async function anotarEnConexion(db: SupabaseClient, companyId: string, conexionId: string, codigo: string | null) {
  await db.from("company_connections").update({ ultimo_error: codigo }).eq("company_id", companyId).eq("id", conexionId);
}

/** Lucía (plantilla `lucia-sdr`) o, si no está, el primer agente de Ventas. null si la empresa no tiene ninguno. */
export async function agentePorDefecto(db: SupabaseClient, companyId: string): Promise<string | null> {
  const { data } = await db.from("agents").select("id, template_id, estado, departments!inner(tipo)").eq("company_id", companyId).neq("estado", "archivado");
  const filas = (data ?? []) as unknown as { id: string; template_id: string | null; departments: { tipo: string } }[];
  return (filas.find((a) => a.template_id === "lucia-sdr") ?? filas.find((a) => a.departments.tipo === "ventas"))?.id ?? null;
}
async function asignarAgentePorDefecto(db: SupabaseClient, companyId: string) {
  const agente = await agentePorDefecto(db, companyId);
  if (agente) await db.from("meta_pages").update({ agent_id: agente }).eq("company_id", companyId).is("agent_id", null);
}

// ── 2) Estado para la interfaz (sin secretos) ─────────────────────────────────────────────────────────────────────────
export type FormularioMeta = { id: string; nombre: string; activo: boolean; archivado: boolean; agenteId: string | null; ultimoLeadEn: string | null };
export type PaginaMeta = {
  id: string; nombre: string; estado: "activa" | "sin_permiso_leads" | "token_caducado" | "desconectada"; recibiendo: boolean;
  aviso: string | null; agenteId: string | null; pruebasComoReales: boolean; pruebaHasta: string | null; ultimoLeadEn: string | null; formularios: FormularioMeta[];
};
export type AgenteParaLeads = { id: string; nombre: string; rol: string; departamento: string; puedeAtender: boolean };
export type EstadoMeta = {
  conexion: { id: string; estado: string; cuenta: string | null; faltan: string[]; faltaImprescindible: boolean } | null;
  paginas: PaginaMeta[];
  /** Nombres de páginas que esta oficina intentó conectar y ya están en otra: las revisa MyOfia. */
  enRevision: string[];
  agentes: AgenteParaLeads[];
  agentePorDefecto: string | null;
};

export async function estadoMeta(d: DepsConexiones, companyId: string): Promise<EstadoMeta> {
  const [con, pag, form, ag, conf] = await Promise.all([
    d.db.from("company_connections").select("id, estado, cuenta_externa, ultimo_error").eq("company_id", companyId).eq("proveedor", PROVEEDOR_META).maybeSingle(),
    d.db.from("meta_pages").select("id, page_id, nombre, estado, suscrita, ultimo_error, agent_id, pruebas_como_reales, prueba_hasta, ultimo_lead_en").eq("company_id", companyId).order("nombre"),
    d.db.from("meta_forms").select("id, page_id, nombre, activo, estado_meta, agent_id, ultimo_lead_en").eq("company_id", companyId).order("nombre"),
    d.db.from("agents").select("id, name, role, estado, departments!inner(name)").eq("company_id", companyId).neq("estado", "archivado").order("name"),
    d.db.from("meta_page_conflicts").select("nombre").eq("empresa_solicitante", companyId).eq("estado", "pendiente"),
  ]);
  if (con.error || pag.error || form.error || ag.error) throw new ConexionError(500, "error_interno", "No se pudo leer la conexión con Facebook.");
  const error = (con.data?.ultimo_error as string | null) ?? "";
  const faltan = error.startsWith("faltan_permisos:") ? error.slice("faltan_permisos:".length).split(",").filter(Boolean) : [];
  const ahora = d.ahora().getTime();
  return {
    conexion: con.data
      ? { id: con.data.id as string, estado: con.data.estado as string, cuenta: (con.data.cuenta_externa as string | null) ?? null, faltan, faltaImprescindible: PERMISOS_IMPRESCINDIBLES.some((p) => faltan.includes(p)) }
      : null,
    paginas: (pag.data ?? []).map((p) => ({
      id: p.id as string, nombre: p.nombre as string, estado: p.estado as PaginaMeta["estado"], recibiendo: p.suscrita === true,
      aviso: (p.ultimo_error as string | null) ?? null, agenteId: (p.agent_id as string | null) ?? null, pruebasComoReales: p.pruebas_como_reales === true,
      pruebaHasta: p.prueba_hasta && new Date(p.prueba_hasta as string).getTime() > ahora ? (p.prueba_hasta as string) : null,
      ultimoLeadEn: (p.ultimo_lead_en as string | null) ?? null,
      formularios: (form.data ?? []).filter((f) => f.page_id === p.page_id).map((f) => ({
        id: f.id as string, nombre: f.nombre as string, activo: f.activo === true, archivado: f.estado_meta !== null && f.estado_meta !== "ACTIVE",
        agenteId: (f.agent_id as string | null) ?? null, ultimoLeadEn: (f.ultimo_lead_en as string | null) ?? null,
      })),
    })),
    enRevision: (conf.data ?? []).map((c) => (c.nombre as string | null) ?? "Una página"),
    agentes: ((ag.data ?? []) as unknown as { id: string; name: string; role: string; estado: string; departments: { name: string } }[]).map((a) => ({
      id: a.id, nombre: a.name, rol: a.role, departamento: a.departments.name, puedeAtender: a.estado === "activo", // solo un agente certificado llega a «activo»
    })),
    agentePorDefecto: await agentePorDefecto(d.db, companyId),
  };
}

// ── 3) Páginas: empezar o dejar de recibir leads ─────────────────────────────────────────────────────────────────────
type FilaPagina = { id: string; page_id: string; estado: string; suscrita: boolean };

async function paginaDe(d: DepsConexiones, companyId: string, id: string): Promise<FilaPagina> {
  if (!Uuid.safeParse(id).success) throw new ConexionError(404, "pagina_no_encontrada", "No existe esa página en vuestra oficina.");
  const { data } = await d.db.from("meta_pages").select("id, page_id, estado, suscrita").eq("company_id", companyId).eq("id", id).maybeSingle();
  if (!data) throw new ConexionError(404, "pagina_no_encontrada", "No existe esa página en vuestra oficina.");
  return data as FilaPagina;
}
async function tokenDePagina(d: DepsConexiones, companyId: string, id: string): Promise<string> {
  const { data } = await d.db.rpc("meta_pagina_token", { p_company_id: companyId, p_id: id });
  if (typeof data !== "string" || !data) throw new ConexionError(409, "volver_a_conectar", "El permiso de esta página ha caducado: vuelve a conectar Facebook.");
  return data;
}
const actualizar = (d: DepsConexiones, companyId: string, id: string, estado: string, suscrita: boolean, error: string | null) =>
  d.db.rpc("meta_pagina_actualizar", { p_company_id: companyId, p_id: id, p_estado: estado, p_suscrita: suscrita, p_error: error });

/** Traduce un fallo de Meta al estado de la página y a un código que la interfaz explica. */
async function anotarFallo(d: DepsConexiones, companyId: string, p: FilaPagina, err: unknown): Promise<ConexionError> {
  const e = err instanceof ErrorDeMeta ? err : new ErrorDeMeta("otro");
  d.log.warn(`[meta] página ${p.id} de la empresa ${companyId}: ${e.message}.`);
  if (e.tipo === "token") {
    await actualizar(d, companyId, p.id, "token_caducado", false, "permiso_caducado");
    return new ConexionError(409, "volver_a_conectar", "El permiso ha caducado: vuelve a conectar Facebook.");
  }
  if (e.tipo === "permiso") {
    await actualizar(d, companyId, p.id, "sin_permiso_leads", false, "acceso_leads");
    return new ConexionError(409, "acceso_leads", "Tu página limita el acceso a los clientes potenciales.");
  }
  await actualizar(d, companyId, p.id, p.estado === "desconectada" ? "desconectada" : p.estado, p.suscrita && p.estado === "activa", e.tipo === "limite" ? "demasiadas_peticiones" : "error_temporal");
  return new ConexionError(502, "meta_no_responde", "Facebook no ha respondido bien. Inténtalo de nuevo en unos minutos.");
}

/** Marca una página: la suscribe al aviso de leads nuevos, trae sus formularios y comprueba que se pueden leer sus leads. */
export async function recibirLeadsDe(d: DepsConexiones, companyId: string, id: string): Promise<void> {
  const p = await paginaDe(d, companyId, id);
  const token = await tokenDePagina(d, companyId, id);
  try {
    await graph(d, `${p.page_id}/subscribed_apps`, { token, metodo: "POST", params: { subscribed_fields: "leadgen" } });
    await actualizar(d, companyId, id, "activa", true, null);
    const formularios = await sincronizarFormularios(d, companyId, p.page_id, token);
    // ¿Deja la página leer sus leads? (gestor de acceso a clientes potenciales del Business Manager). Solo se piden ids.
    const primero = formularios.find((f) => f.status === "ACTIVE") ?? formularios[0];
    if (primero) await graph(d, `${primero.id}/leads`, { token, params: { fields: "id", limit: "1" } });
  } catch (err) {
    throw await anotarFallo(d, companyId, p, err);
  }
}

/** Desmarca una página: deja de avisarnos de sus leads. Si Meta no responde, igualmente dejamos de atenderlos. */
export async function dejarDeRecibirLeadsDe(d: DepsConexiones, companyId: string, id: string): Promise<void> {
  const p = await paginaDe(d, companyId, id);
  try {
    const token = await tokenDePagina(d, companyId, id);
    await graph(d, `${p.page_id}/subscribed_apps`, { token, metodo: "DELETE" });
  } catch (err) {
    d.log.warn(`[meta] no se pudo anular la suscripción de la página ${id} (${err instanceof ErrorDeMeta ? err.message : "error"}); se deja de atender igualmente.`);
  }
  if (p.estado === "activa") await actualizar(d, companyId, id, "activa", false, null);
}

/** Formularios de la página: los nuevos entran marcados si están activos en Meta; los que ya estaban conservan lo elegido. */
async function sincronizarFormularios(d: DepsConexiones, companyId: string, pageId: string, token: string) {
  const deMeta = (await graphLista<{ id: string; name?: string; status?: string }>(d, `${pageId}/leadgen_forms`, { token, params: { fields: "id,name,status" } }))
    .filter((f) => ID_META.test(f.id));
  const { data: existentes } = await d.db.from("meta_forms").select("form_id").eq("company_id", companyId).eq("page_id", pageId);
  const conocidos = new Set((existentes ?? []).map((f) => f.form_id as string));
  const nuevos = deMeta.filter((f) => !conocidos.has(f.id)).map((f) => ({
    company_id: companyId, page_id: pageId, form_id: f.id, nombre: (f.name ?? "Formulario sin nombre").slice(0, 300), activo: f.status === "ACTIVE", estado_meta: f.status ?? null,
  }));
  if (nuevos.length) await d.db.from("meta_forms").insert(nuevos);
  for (const f of deMeta.filter((x) => conocidos.has(x.id))) {
    await d.db.from("meta_forms").update({ nombre: (f.name ?? "Formulario sin nombre").slice(0, 300), estado_meta: f.status ?? null }).eq("company_id", companyId).eq("form_id", f.id);
  }
  return deMeta;
}

export async function actualizarFormularios(d: DepsConexiones, companyId: string, id: string): Promise<void> {
  const p = await paginaDe(d, companyId, id);
  try {
    await sincronizarFormularios(d, companyId, p.page_id, await tokenDePagina(d, companyId, id));
  } catch (err) {
    if (err instanceof ConexionError) throw err;
    throw await anotarFallo(d, companyId, p, err);
  }
}

// ── 4) Ajustes: agente que atiende, formularios y leads de prueba ───────────────────────────────────────────────────────
async function exigirAgente(db: SupabaseClient, companyId: string, agenteId: string | null) {
  if (agenteId === null) return;
  const { data } = await db.from("agents").select("id").eq("company_id", companyId).eq("id", agenteId).neq("estado", "archivado").maybeSingle();
  if (!data) throw new ConexionError(422, "agente_no_valido", "Ese agente no existe en vuestra oficina.");
}

export const AjustesPagina = z.strictObject({ agenteId: Uuid.optional(), pruebasComoReales: z.boolean().optional() });
export async function guardarPagina(d: DepsConexiones, companyId: string, id: string, a: z.infer<typeof AjustesPagina>): Promise<void> {
  await paginaDe(d, companyId, id);
  if (a.agenteId) await exigirAgente(d.db, companyId, a.agenteId);
  const cambios = { ...(a.agenteId ? { agent_id: a.agenteId } : {}), ...(a.pruebasComoReales === undefined ? {} : { pruebas_como_reales: a.pruebasComoReales }) };
  if (!Object.keys(cambios).length) return;
  const { error } = await d.db.from("meta_pages").update({ ...cambios, actualizado_en: d.ahora().toISOString() }).eq("company_id", companyId).eq("id", id);
  if (error) throw new ConexionError(500, "error_interno", "No se pudo guardar.");
}

/** `agenteId: null` = el agente de la página. */
export const AjustesFormulario = z.strictObject({ activo: z.boolean().optional(), agenteId: Uuid.nullable().optional() });
export async function guardarFormulario(d: DepsConexiones, companyId: string, id: string, a: z.infer<typeof AjustesFormulario>): Promise<void> {
  if (!Uuid.safeParse(id).success) throw new ConexionError(404, "formulario_no_encontrado", "No existe ese formulario en vuestra oficina.");
  if (a.agenteId !== undefined) await exigirAgente(d.db, companyId, a.agenteId);
  const cambios = { ...(a.activo === undefined ? {} : { activo: a.activo }), ...(a.agenteId === undefined ? {} : { agent_id: a.agenteId }) };
  if (!Object.keys(cambios).length) return;
  const { data, error } = await d.db.from("meta_forms").update(cambios).eq("company_id", companyId).eq("id", id).select("id");
  if (error) throw new ConexionError(500, "error_interno", "No se pudo guardar.");
  if (!data?.length) throw new ConexionError(404, "formulario_no_encontrado", "No existe ese formulario en vuestra oficina.");
}

/** «Enviar lead de prueba»: durante unos minutos, lo que llegue a esa página se marca como prueba. */
export async function abrirPrueba(d: DepsConexiones, companyId: string, id: string): Promise<{ desde: string; hasta: string; enlace: string }> {
  const p = await paginaDe(d, companyId, id);
  if (p.estado !== "activa" || !p.suscrita) throw new ConexionError(409, "pagina_sin_marcar", "Marca primero la página para recibir sus leads.");
  const desde = d.ahora();
  const hasta = new Date(desde.getTime() + MINUTOS_DE_PRUEBA * 60_000).toISOString();
  const { error } = await d.db.from("meta_pages").update({ prueba_hasta: hasta }).eq("company_id", companyId).eq("id", id);
  if (error) throw new ConexionError(500, "error_interno", "No se pudo preparar la prueba.");
  return { desde: desde.toISOString(), hasta, enlace: ENLACE_PRUEBA_DE_LEADS };
}

export type LeadRecibido = { id: string; recibidoEn: string; formulario: string | null; esPrueba: boolean; estado: string };
/** Lo que ha llegado a la página desde `desde` (solo cuándo y por qué formulario: los datos del lead no se guardan aquí). */
export async function leadsRecibidos(d: DepsConexiones, companyId: string, id: string, desde: string): Promise<LeadRecibido[]> {
  const p = await paginaDe(d, companyId, id);
  const inicio = z.iso.datetime({ offset: true }).safeParse(desde);
  if (!inicio.success) throw new ConexionError(400, "peticion_invalida", "La fecha no es válida.");
  const [ev, forms] = await Promise.all([
    d.db.from("meta_lead_events").select("id, form_id, recibido_en, es_prueba, estado").eq("company_id", companyId).eq("page_id", p.page_id).gte("recibido_en", inicio.data).order("recibido_en", { ascending: false }).limit(20),
    d.db.from("meta_forms").select("form_id, nombre").eq("company_id", companyId).eq("page_id", p.page_id),
  ]);
  if (ev.error) throw new ConexionError(500, "error_interno", "No se pudieron leer los leads recibidos.");
  const nombres = new Map((forms.data ?? []).map((f) => [f.form_id as string, f.nombre as string]));
  return (ev.data ?? []).map((x) => ({ id: x.id as string, recibidoEn: x.recibido_en as string, formulario: nombres.get(x.form_id as string) ?? null, esPrueba: x.es_prueba === true, estado: x.estado as string }));
}

// ── 5) Desconectar: dejar de recibir avisos y retirar los permisos en Meta (mejor esfuerzo) ───────────────────────────
export async function limpiarEnMetaAntesDeDesconectar(d: DepsConexiones, companyId: string): Promise<void> {
  if (!obtenerProveedor(PROVEEDOR_META)) return;
  const { data: paginas } = await d.db.from("meta_pages").select("id, page_id").eq("company_id", companyId).eq("estado", "activa").eq("suscrita", true);
  for (const p of paginas ?? []) {
    try {
      await graph(d, `${p.page_id}/subscribed_apps`, { token: await tokenDePagina(d, companyId, p.id as string), metodo: "DELETE" });
    } catch { /* se desconecta igualmente */ }
  }
  // No se retiran los permisos de la persona en Facebook (DELETE /me/permissions): son de toda la app, y si esa persona
  // también conectó otra oficina, la dejaría sin leads. Basta con borrar aquí sus tokens (lo hace la desconexión).
}
