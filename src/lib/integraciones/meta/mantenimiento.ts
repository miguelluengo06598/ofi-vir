/**
 * Mantenimiento de Meta Lead Ads, sin IA. SOLO SERVIDOR.
 *
 *  - `recuperarLeadsPerdidos` (cada hora): para cada formulario marcado pide a Meta los leads creados desde la última
 *    recuperación (con solape) y registra los que no tenemos (`meta_lead_registrar`, idempotente por leadgen_id). No
 *    lanza agentes: el evento sigue el flujo normal (lo procesa `leads-meta`).
 *  - `revisarSaludDeMeta` (cada día): suscripción de cada página (si se perdió, se intenta recuperar), que su permiso
 *    funciona, que se pueden leer sus leads, los permisos de la cuenta y la alerta de «sin leads con anuncios activos».
 *    Un cambio a mal avisa a la empresa (qué tiene que hacer) y deja una alerta en la oficina de MyOfia; al arreglarse,
 *    la alerta se cierra. No se repiten avisos mientras nada cambie.
 *  - `avisoDeFacebook`: desautorización y solicitud de eliminación de datos (`signed_request` firmado con el secreto).
 */
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { PERMISOS_META_LEADS, urlDeLaApp } from "../proveedores.ts";
import { obtenerCredenciales, type DepsConexiones } from "../servicio.ts";
import { ErrorDeMeta, graph, graphLista } from "./graph.ts";
import { PERMISOS_IMPRESCINDIBLES, PROVEEDOR_META } from "./servicio.ts";

if (typeof window !== "undefined") throw new Error("src/lib/integraciones/meta/mantenimiento.ts es solo para el servidor.");

/** Meta guarda los leads 90 días: más atrás no tiene sentido pedir. */
const VENTANA_MAXIMA_MS = 89 * 24 * 3600_000;
const SOLAPE_MS = 15 * 60_000;
/** Sin leads durante estos días, con anuncios activos → alerta. Y no se repite antes de una semana. */
export const DIAS_SIN_LEADS = 3;
const REPETIR_ALERTA_SIN_LEADS_MS = 7 * 24 * 3600_000;

type Pagina = { id: string; company_id: string; page_id: string; nombre: string; estado: string; suscrita: boolean; suscrita_en: string | null; ultimo_error: string | null; ultimo_lead_en: string | null; alerta_sin_leads_en: string | null };
const COLS_PAGINA = "id, company_id, page_id, nombre, estado, suscrita, suscrita_en, ultimo_error, ultimo_lead_en, alerta_sin_leads_en";

const tokenDePagina = async (db: SupabaseClient, p: Pagina) => {
  const { data } = await db.rpc("meta_pagina_token", { p_company_id: p.company_id, p_id: p.id });
  return typeof data === "string" && data ? data : null;
};

// ── 1) Recuperación de leads perdidos ─────────────────────────────────────────────────────────────────────────────────
export async function recuperarLeadsPerdidos(d: DepsConexiones): Promise<{ formularios: number; nuevos: number; errores: number }> {
  const inicio = d.ahora();
  const { data: paginas, error } = await d.db.from("meta_pages").select(COLS_PAGINA).eq("estado", "activa").eq("suscrita", true);
  if (error) throw new Error("leads-meta-recuperar: no se pudieron leer las páginas.");
  let formularios = 0, nuevos = 0, errores = 0;
  for (const p of (paginas ?? []) as Pagina[]) {
    const token = await tokenDePagina(d.db, p);
    if (!token) continue;
    const { data: forms } = await d.db.from("meta_forms").select("id, form_id, recuperado_hasta").eq("company_id", p.company_id).eq("page_id", p.page_id).eq("activo", true);
    for (const f of forms ?? []) {
      formularios++;
      const desde = Math.max(
        new Date((f.recuperado_hasta as string | null) ?? p.suscrita_en ?? inicio.toISOString()).getTime() - SOLAPE_MS,
        inicio.getTime() - VENTANA_MAXIMA_MS,
      );
      try {
        const leads = await graphLista<{ id: string; created_time?: string; ad_id?: string; adset_id?: string }>(d, `${f.form_id}/leads`, {
          token, params: { fields: "id,created_time,ad_id,adset_id", filtering: JSON.stringify([{ field: "time_created", operator: "GREATER_THAN", value: Math.floor(desde / 1000) }]) },
        });
        for (const l of leads) {
          if (!/^[0-9]{1,32}$/.test(l.id)) continue;
          const { data, error: e } = await d.db.rpc("meta_lead_registrar", {
            p_page_id: p.page_id, p_form_id: f.form_id, p_leadgen_id: l.id, p_ad_id: /^[0-9]{1,32}$/.test(l.ad_id ?? "") ? l.ad_id : null,
            p_adgroup_id: /^[0-9]{1,32}$/.test(l.adset_id ?? "") ? l.adset_id : null, p_created_time: l.created_time ? new Date(l.created_time).toISOString() : null,
          });
          if (e) { errores++; continue; }
          if ((data as { nuevo?: boolean } | null)?.nuevo) nuevos++;
        }
        // Solo se avanza el cursor si la consulta fue bien: si no, la próxima vuelta lo vuelve a pedir.
        await d.db.from("meta_forms").update({ recuperado_hasta: inicio.toISOString() }).eq("id", f.id);
      } catch (e) {
        errores++;
        d.log.warn(`[meta] recuperación: formulario ${f.id} (${e instanceof ErrorDeMeta ? e.message : "error"}).`);
      }
    }
  }
  if (nuevos) d.log.info(`[meta] recuperación: ${nuevos} lead(s) que no habían llegado por el aviso de Facebook.`);
  return { formularios, nuevos, errores };
}

// ── 2) Salud de la conexión ───────────────────────────────────────────────────────────────────────────────────────────
export type ProblemaMeta = "suscripcion_perdida" | "permiso_caducado" | "acceso_leads" | "faltan_permisos" | "sin_leads_con_anuncios";

/** Qué tiene que hacer la empresa, en lenguaje normal. */
export const QUE_HACER: Record<ProblemaMeta, { titulo: string; cuerpo: string }> = {
  suscripcion_perdida: {
    titulo: "Facebook ha dejado de avisarnos de tus leads",
    cuerpo: "La página «{pagina}» ya no nos avisa cuando llega un lead. Entra en Conexiones → Facebook y vuelve a marcarla; si no se deja, vuelve a conectar Facebook. Mientras tanto seguimos recuperando sus leads cada hora.",
  },
  permiso_caducado: { titulo: "El permiso de Facebook ha caducado", cuerpo: "El permiso de la página «{pagina}» ha caducado: vuelve a conectar Facebook en Conexiones." },
  acceso_leads: {
    titulo: "Tu página limita el acceso a los clientes potenciales",
    cuerpo: "La página «{pagina}» limita el acceso a los clientes potenciales: da acceso a MyOfia en la configuración de acceso a clientes potenciales de tu Business Manager y vuelve a marcar la página.",
  },
  faltan_permisos: { titulo: "Faltan permisos de Facebook", cuerpo: "Al conectar Facebook no se aceptaron todos los permisos que necesitamos. Vuelve a conectar Facebook en Conexiones y acéptalos." },
  sin_leads_con_anuncios: {
    titulo: "Tu página no recibe leads aunque tus anuncios siguen activos",
    cuerpo: "La página «{pagina}» lleva {dias} días sin recibir leads y tiene anuncios activos. Suele ser el acceso a clientes potenciales: revisa en tu Business Manager que MyOfia tiene acceso a los clientes potenciales de la página.",
  },
};

export type ResultadoSalud = { paginas: number; bien: number; problemas: { pagina: string; problema: ProblemaMeta }[]; resuscritas: number };

export async function revisarSaludDeMeta(d: DepsConexiones): Promise<ResultadoSalud> {
  const ahora = d.ahora();
  const appId = d.env.META_APP_ID?.trim() ?? "";
  const r: ResultadoSalud = { paginas: 0, bien: 0, problemas: [], resuscritas: 0 };
  const { data: conexiones } = await d.db.from("company_connections").select("id, company_id, ultimo_error").eq("proveedor", PROVEEDOR_META).eq("estado", "conectado");

  for (const con of conexiones ?? []) {
    const companyId = con.company_id as string;
    // Permisos de la cuenta. El permiso de la PERSONA dura ~60 días y puede caducar sin que fallen las páginas (sus permisos
    // no caducan): si no funciona, no se da la conexión por perdida; solo no se pueden revisar los permisos ni los anuncios.
    let tokenUsuario: string | null = null;
    try {
      tokenUsuario = (await obtenerCredenciales(d, companyId, PROVEEDOR_META))?.token ?? null;
      if (tokenUsuario) {
        const concedidos = (await graphLista<{ permission: string; status: string }>(d, "me/permissions", { token: tokenUsuario }))
          .filter((p) => p.status === "granted").map((p) => p.permission);
        const faltan = PERMISOS_META_LEADS.filter((p) => !concedidos.includes(p));
        const codigo = faltan.length ? `faltan_permisos:${faltan.join(",")}` : null;
        if (codigo !== ((con.ultimo_error as string | null) ?? null)) {
          await d.db.from("company_connections").update({ ultimo_error: codigo }).eq("id", con.id);
          if (PERMISOS_IMPRESCINDIBLES.some((p) => faltan.includes(p))) {
            await avisar(d, companyId, "faltan_permisos", null, { conexion_id: con.id });
            r.problemas.push({ pagina: "(cuenta)", problema: "faltan_permisos" });
          }
        }
      }
    } catch (e) {
      tokenUsuario = null;
      if (!(e instanceof ErrorDeMeta && e.tipo === "token")) d.log.warn(`[meta] salud: permisos de la empresa ${companyId} (${e instanceof ErrorDeMeta ? e.message : "error"}).`);
    }

    const { data: paginas } = await d.db.from("meta_pages").select(COLS_PAGINA).eq("company_id", companyId).eq("connection_id", con.id).in("estado", ["activa", "sin_permiso_leads"]);
    for (const p of (paginas ?? []) as Pagina[]) {
      r.paginas++;
      const problema = await revisarPagina(d, p, appId, tokenUsuario, ahora, r);
      if (problema) r.problemas.push({ pagina: p.nombre, problema }); else r.bien++;
      await d.db.from("meta_pages").update({ salud_revisada_en: ahora.toISOString() }).eq("id", p.id);
    }
  }
  if (r.problemas.length) d.log.warn(`[meta] salud: ${r.problemas.length} problema(s) en ${r.paginas} página(s).`);
  return r;
}

async function revisarPagina(d: DepsConexiones, p: Pagina, appId: string, tokenUsuario: string | null, ahora: Date, r: ResultadoSalud): Promise<ProblemaMeta | null> {
  const token = await tokenDePagina(d.db, p);
  if (!token) return marcar(d, p, "token_caducado", false, "permiso_caducado");
  // Perdió la suscripción y no se pudo recuperar: el aviso sigue hasta que la empresa vuelva a marcarla (no se repite).
  if (!p.suscrita && p.ultimo_error === "suscripcion_perdida") return "suscripcion_perdida";
  // La empresa quería sus leads: la tenía marcada, o se desmarcó sola porque Facebook le quitó el acceso a los leads.
  const debiaRecibir = p.suscrita || (p.estado === "sin_permiso_leads" && p.ultimo_error === "acceso_leads");
  try {
    // a) ¿Sigue suscrita? Solo importa si la empresa la tenía marcada.
    let suscrita = p.suscrita;
    if (debiaRecibir) {
      const apps = await graphLista<{ id?: string; subscribed_fields?: string[] }>(d, `${p.page_id}/subscribed_apps`, { token });
      suscrita = apps.some((a) => a.id === appId && (a.subscribed_fields ?? []).includes("leadgen"));
      if (!suscrita) {
        try {
          await graph(d, `${p.page_id}/subscribed_apps`, { token, metodo: "POST", params: { subscribed_fields: "leadgen" } });
          suscrita = true;
          r.resuscritas++;
          d.log.info(`[meta] salud: la página ${p.id} había perdido la suscripción y se ha recuperado.`);
        } catch {
          return marcar(d, p, "activa", false, "suscripcion_perdida");
        }
      }
    }
    // b) ¿Se pueden leer sus leads? (gestor de acceso a clientes potenciales). Solo se piden ids.
    const { data: form } = await d.db.from("meta_forms").select("form_id").eq("company_id", p.company_id).eq("page_id", p.page_id).eq("activo", true).limit(1).maybeSingle();
    if (form) await graph(d, `${form.form_id}/leads`, { token, params: { fields: "id", limit: "1" } });

    // c) Sin leads desde hace días con anuncios activos.
    if (suscrita && p.ultimo_lead_en && ahora.getTime() - new Date(p.ultimo_lead_en).getTime() > DIAS_SIN_LEADS * 24 * 3600_000
        && (!p.alerta_sin_leads_en || ahora.getTime() - new Date(p.alerta_sin_leads_en).getTime() > REPETIR_ALERTA_SIN_LEADS_MS)
        && tokenUsuario && (await tieneAnunciosActivos(d, p, tokenUsuario))) {
      const dias = Math.floor((ahora.getTime() - new Date(p.ultimo_lead_en).getTime()) / (24 * 3600_000));
      await d.db.from("meta_pages").update({ alerta_sin_leads_en: ahora.toISOString() }).eq("id", p.id);
      await avisar(d, p.company_id, "sin_leads_con_anuncios", p, { dias });
      await alertaInterna(d.db, p, "sin_leads_con_anuncios", { dias });
      // No cambia el estado de la página: puede ser solo que el anuncio no convierte.
    }
    // Todo en orden: si venía de un problema, se arregla y se cierra la alerta.
    if (p.estado !== "activa" || p.ultimo_error || suscrita !== p.suscrita) {
      await d.db.rpc("meta_pagina_actualizar", { p_company_id: p.company_id, p_id: p.id, p_estado: "activa", p_suscrita: suscrita, p_error: null });
    }
    await cerrarAlertas(d.db, p);
    return null;
  } catch (e) {
    if (e instanceof ErrorDeMeta && e.tipo === "token") return marcar(d, p, "token_caducado", false, "permiso_caducado");
    if (e instanceof ErrorDeMeta && e.tipo === "permiso") return marcar(d, p, "sin_permiso_leads", false, "acceso_leads");
    d.log.warn(`[meta] salud: página ${p.id} (${e instanceof ErrorDeMeta ? e.message : "error"}); se revisará mañana.`);
    return null; // un fallo temporal de Meta no es un problema del cliente
  }
}

/** Anuncios de los últimos leads de la página: ¿alguno sigue activo? Sin permiso para verlo, se responde que no. */
async function tieneAnunciosActivos(d: DepsConexiones, p: Pagina, tokenUsuario: string): Promise<boolean> {
  const desde = new Date(d.ahora().getTime() - 60 * 24 * 3600_000).toISOString();
  const { data } = await d.db.from("meta_lead_events").select("ad_id").eq("page_id", p.page_id).eq("company_id", p.company_id).not("ad_id", "is", null).gte("recibido_en", desde).order("recibido_en", { ascending: false }).limit(50);
  const anuncios = [...new Set((data ?? []).map((x) => x.ad_id as string))].slice(0, 5);
  for (const ad of anuncios) {
    try {
      const a = await graph<{ effective_status?: string }>(d, ad, { token: tokenUsuario, params: { fields: "effective_status" } });
      if (a.effective_status === "ACTIVE") return true;
    } catch { /* sin permiso o anuncio borrado: no cuenta */ }
  }
  return false;
}

/** Cambia la página a un estado con problema. Solo avisa si es un cambio (no se repite cada día). */
async function marcar(d: DepsConexiones, p: Pagina, estado: string, suscrita: boolean, problema: ProblemaMeta): Promise<ProblemaMeta> {
  const yaEstaba = p.estado === estado && p.ultimo_error === problema;
  await d.db.rpc("meta_pagina_actualizar", { p_company_id: p.company_id, p_id: p.id, p_estado: estado, p_suscrita: suscrita, p_error: problema });
  if (!yaEstaba) {
    await avisar(d, p.company_id, problema, p, {});
    await alertaInterna(d.db, p, problema, {});
  }
  return problema;
}

async function avisar(d: DepsConexiones, companyId: string, problema: ProblemaMeta, p: Pagina | null, datos: Record<string, unknown>) {
  const t = QUE_HACER[problema];
  const cuerpo = t.cuerpo.replace("{pagina}", p?.nombre ?? "").replace("{dias}", String(datos.dias ?? DIAS_SIN_LEADS));
  const { error } = await d.db.from("notifications").insert({ company_id: companyId, tipo: "meta_conexion_aviso", titulo: t.titulo, cuerpo, metadatos: { problema, pagina_id: p?.id ?? null, ...datos } });
  if (error) d.log.warn(`[meta] no se pudo guardar el aviso ${problema} de la empresa ${companyId} (${error.code ?? "error"}).`);
}

async function alertaInterna(db: SupabaseClient, p: Pagina, problema: ProblemaMeta, datos: Record<string, unknown>) {
  await db.from("internal_alerts").insert({ tipo: "meta_conexion", company_id: p.company_id, detalle: { problema, pagina_id: p.id, pagina: p.nombre, ...datos } });
}
async function cerrarAlertas(db: SupabaseClient, p: Pagina) {
  await db.from("internal_alerts").update({ leida_en: new Date().toISOString() }).eq("tipo", "meta_conexion").eq("company_id", p.company_id).is("leida_en", null).eq("detalle->>pagina_id", p.id);
}

// ── 3) Avisos de Facebook: desautorización y eliminación de datos ──────────────────────────────────────────────────────
/** Comprueba un `signed_request` de Meta (base64url(firma).base64url(datos), HMAC-SHA256 con el secreto de la app). */
export function leerSignedRequest(valor: string, appSecret: string): { user_id: string; issued_at?: number } | null {
  const [firma, datos, ...resto] = valor.split(".");
  if (!firma || !datos || resto.length || valor.length > 4000) return null;
  const esperada = createHmac("sha256", appSecret).update(datos).digest();
  let recibida: Buffer;
  try { recibida = Buffer.from(firma, "base64url"); } catch { return null; }
  if (recibida.length !== esperada.length || !timingSafeEqual(recibida, esperada)) return null;
  try {
    const carga = JSON.parse(Buffer.from(datos, "base64url").toString("utf8")) as { algorithm?: unknown; user_id?: unknown; issued_at?: unknown };
    if (String(carga.algorithm).toUpperCase() !== "HMAC-SHA256" || typeof carga.user_id !== "string" || !/^[0-9]{1,32}$/.test(carga.user_id)) return null;
    return { user_id: carga.user_id, issued_at: typeof carga.issued_at === "number" ? carga.issued_at : undefined };
  } catch {
    return null;
  }
}

/** POST /api/webhooks/meta/desautorizar y /eliminar-datos: Meta envía un formulario con `signed_request`. */
export async function avisoDeFacebook(d: { db: SupabaseClient; env: Record<string, string | undefined>; log: Pick<Console, "info" | "warn" | "error"> }, tipo: "desautorizar" | "eliminar", req: Request): Promise<Response> {
  const secreto = d.env.META_APP_SECRET?.trim();
  if (!secreto) return Response.json({ error: "sin_configurar" }, { status: 503 });
  let valor = "";
  try {
    const texto = await req.text();
    if (texto.length > 8000) return Response.json({ error: "demasiado_grande" }, { status: 413 });
    valor = new URLSearchParams(texto).get("signed_request") ?? "";
  } catch { /* cuerpo ilegible: firma no válida */ }
  const carga = leerSignedRequest(valor, secreto);
  if (!carga) return Response.json({ error: "firma_no_valida" }, { status: 400 });

  const { data: n, error } = await d.db.rpc("meta_desautorizar", { p_id_externo: carga.user_id, p_borrar: tipo === "eliminar" });
  if (error) {
    d.log.error(`[meta] ${tipo}: no se pudo desconectar (${error.code ?? "error"}).`);
    return Response.json({ error: "error_interno" }, { status: 500 });
  }
  d.log.info(`[meta] ${tipo}: ${n} conexión(es) de Facebook afectada(s).`);
  if (tipo === "desautorizar") return Response.json({ ok: true });

  // Meta exige una URL donde la persona pueda consultar el estado y un código de confirmación.
  const codigo = randomBytes(16).toString("hex");
  const { error: e2 } = await d.db.from("meta_data_deletion_requests").insert({
    codigo, usuario_hash: createHash("sha256").update(`meta:${carga.user_id}`).digest("hex"), estado: "completada", conexiones: (n as number) ?? 0, completado_en: new Date().toISOString(),
  });
  if (e2) {
    d.log.error(`[meta] eliminar: no se pudo guardar la solicitud (${e2.code ?? "error"}).`);
    return Response.json({ error: "error_interno" }, { status: 500 });
  }
  return Response.json({ url: `${urlDeLaApp(d.env) ?? ""}/eliminacion-datos/${codigo}`, confirmation_code: codigo });
}
