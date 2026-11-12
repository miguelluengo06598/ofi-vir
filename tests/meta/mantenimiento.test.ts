/**
 * Mantenimiento de Meta Lead Ads contra la base LOCAL (Facebook simulado): recuperar leads perdidos, salud de la conexión,
 * «sin leads con anuncios activos», desconectar y los avisos firmados de desautorización y de eliminación de datos.
 * Ejecutar: `npm run test:meta` con la base local.
 */
import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { before, describe, it } from "node:test";
import { avisoDeFacebook, recuperarLeadsPerdidos, revisarSaludDeMeta } from "../../src/lib/integraciones/meta/mantenimiento.ts";
import type { DepsConexiones } from "../../src/lib/integraciones/servicio.ts";
import { clienteLocal } from "../ayuda/clienteLocal.ts";

const { db } = clienteLocal();
const EMPRESA = "a0000000-0000-4000-8000-000000000002"; // Taller Medina (semilla)
const APP_ID = "123456789012345";
const SECRETO = "secreto-de-prueba-meta-mantenimiento";
const FB_USUARIO = String(Date.now()).slice(-10);
const PAGINA = String(Date.now()).slice(-9) + "7";
const FORM = String(Date.now()).slice(-9) + "8";
const ENV = { META_APP_SECRET: SECRETO, META_APP_ID: APP_ID, META_GRAPH_VERSION: "v26.0", APP_URL: "https://app.test", CONEXIONES_STATE_SECRET: "x".repeat(40) };
const silencio = { info() {}, warn() {}, error() {} };

/** Facebook simulado: cada prueba cambia lo que responde. */
const meta = {
  leadsDelFormulario: [] as { id: string; created_time: string; ad_id?: string }[],
  suscrita: true,
  resuscribirFalla: false,
  leadsSinAcceso: false,
  tokenPaginaCaducado: false,
  permisos: ["leads_retrieval", "pages_manage_metadata", "pages_show_list", "pages_read_engagement", "ads_management", "pages_manage_ads"],
  anuncioActivo: false,
};
const pedidas: { metodo: string; ruta: string; params: URLSearchParams }[] = [];
const fetchMeta = (async (u: string, init: RequestInit) => {
  const url = new URL(u);
  const metodo = init.method ?? "GET";
  const params = metodo === "POST" ? new URLSearchParams(String(init.body)) : url.searchParams;
  const ruta = url.pathname.replace("/v26.0/", "");
  pedidas.push({ metodo, ruta, params });
  const error = (code: number, status = 400) => Response.json({ error: { code } }, { status });
  if (meta.tokenPaginaCaducado && ruta.startsWith(PAGINA)) return error(190);
  if (ruta === "me/permissions") return Response.json({ data: meta.permisos.map((p) => ({ permission: p, status: "granted" })) });
  if (ruta === `${PAGINA}/subscribed_apps` && metodo === "GET") return Response.json({ data: meta.suscrita ? [{ id: APP_ID, subscribed_fields: ["leadgen"] }] : [] });
  if (ruta === `${PAGINA}/subscribed_apps` && metodo === "POST") { if (meta.resuscribirFalla) return error(200, 403); meta.suscrita = true; return Response.json({ success: true }); }
  if (ruta === `${PAGINA}/subscribed_apps` && metodo === "DELETE") { meta.suscrita = false; return Response.json({ success: true }); }
  if (ruta === `${FORM}/leads`) return meta.leadsSinAcceso ? error(200, 403) : Response.json({ data: params.get("limit") === "1" ? meta.leadsDelFormulario.slice(0, 1) : meta.leadsDelFormulario });
  if (/^\d+$/.test(ruta)) return Response.json({ effective_status: meta.anuncioActivo ? "ACTIVE" : "PAUSED" });
  return error(100);
}) as unknown as typeof fetch;

const deps = (ahora = new Date()): DepsConexiones => ({ db, env: ENV, fetch: fetchMeta, ahora: () => ahora, log: silencio });
const leerPagina = async () => (await db.from("meta_pages").select("estado, suscrita, ultimo_error, alerta_sin_leads_en").eq("company_id", EMPRESA).eq("page_id", PAGINA).single()).data!;
const avisos = async () => (await db.from("notifications").select("titulo, metadatos").eq("company_id", EMPRESA).eq("tipo", "meta_conexion_aviso").order("creado_en")).data ?? [];
const alertasAbiertas = async () => (await db.from("internal_alerts").select("detalle").eq("company_id", EMPRESA).eq("tipo", "meta_conexion").is("leida_en", null).eq("detalle->>pagina_id", paginaId)).data ?? [];
const firmar = (carga: object) => {
  const datos = Buffer.from(JSON.stringify(carga)).toString("base64url");
  return `${createHmac("sha256", SECRETO).update(datos).digest("base64url")}.${datos}`;
};
const peticionFirmada = (valor: string) => new Request("https://app.test/x", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ signed_request: valor }) });

let conexion = "", paginaId = "";
before(async () => {
  const c = await db.rpc("conexion_guardar", {
    p_company_id: EMPRESA, p_user_id: null, p_proveedor: "meta_leads", p_tipo_auth: "oauth2", p_cuenta: "Prueba", p_scopes: meta.permisos, p_caduca: null,
    p_secreto: JSON.stringify({ v: 1, access_token: `token-usuario-${randomUUID()}` }),
  });
  assert.ifError(c.error);
  conexion = c.data as string;
  assert.ifError((await db.from("company_connections").update({ id_externo: FB_USUARIO }).eq("id", conexion)).error);
  const p = await db.rpc("meta_pagina_conectar", { p_company_id: EMPRESA, p_connection_id: conexion, p_user_id: null, p_page_id: PAGINA, p_nombre: "Taller en Facebook", p_secreto: `token-pagina-${randomUUID()}` });
  paginaId = p.data.id;
  assert.ifError((await db.rpc("meta_pagina_actualizar", { p_company_id: EMPRESA, p_id: paginaId, p_estado: "activa", p_suscrita: true, p_error: null })).error);
  assert.ifError((await db.from("meta_forms").insert({ company_id: EMPRESA, page_id: PAGINA, form_id: FORM, nombre: "Presupuesto", activo: true, estado_meta: "ACTIVE" })).error);
});

describe("recuperación de leads perdidos", () => {
  it("crea solo los eventos que faltan, pide desde la última vez con solape y no lanza agentes", async () => {
    const ya = String(Math.floor(Math.random() * 1e14));
    const perdido = String(Math.floor(Math.random() * 1e14));
    assert.ifError((await db.rpc("meta_lead_registrar", { p_page_id: PAGINA, p_form_id: FORM, p_leadgen_id: ya, p_ad_id: "888", p_adgroup_id: null, p_created_time: null })).error);
    meta.leadsDelFormulario = [{ id: ya, created_time: new Date().toISOString(), ad_id: "888" }, { id: perdido, created_time: new Date().toISOString(), ad_id: "888" }];
    const r = await recuperarLeadsPerdidos(deps());
    assert.deepEqual([r.nuevos, r.errores], [1, 0]);
    const filtro = JSON.parse(pedidas.find((p) => p.ruta === `${FORM}/leads`)!.params.get("filtering")!);
    assert.equal(filtro[0].field, "time_created");
    const { data: ev } = await db.from("meta_lead_events").select("estado, task_id").eq("leadgen_id", perdido).single();
    assert.deepEqual(ev, { estado: "recibido", task_id: null }, "solo el evento: el flujo normal lo procesará");
    const { data: f } = await db.from("meta_forms").select("recuperado_hasta").eq("company_id", EMPRESA).eq("form_id", FORM).single();
    assert.ok(f!.recuperado_hasta);
    assert.equal((await recuperarLeadsPerdidos(deps())).nuevos, 0, "la segunda vuelta no repite nada");
  });

  it("un lead que se ignoró mientras la página no podía recibirlo se reabre al recuperarlo", async () => {
    const id = String(Math.floor(Math.random() * 1e14));
    await db.rpc("meta_pagina_actualizar", { p_company_id: EMPRESA, p_id: paginaId, p_estado: "activa", p_suscrita: false, p_error: null });
    await db.rpc("meta_lead_registrar", { p_page_id: PAGINA, p_form_id: FORM, p_leadgen_id: id, p_ad_id: null, p_adgroup_id: null, p_created_time: null });
    assert.equal((await db.from("meta_lead_events").select("estado").eq("leadgen_id", id).single()).data!.estado, "ignorado");
    await db.rpc("meta_pagina_actualizar", { p_company_id: EMPRESA, p_id: paginaId, p_estado: "activa", p_suscrita: true, p_error: null });
    meta.leadsDelFormulario = [{ id, created_time: new Date().toISOString() }];
    await db.from("meta_forms").update({ recuperado_hasta: null }).eq("company_id", EMPRESA).eq("form_id", FORM);
    assert.equal((await recuperarLeadsPerdidos(deps())).nuevos, 1);
    assert.equal((await db.from("meta_lead_events").select("estado").eq("leadgen_id", id).single()).data!.estado, "recibido");
  });
});

describe("salud de la conexión", () => {
  it("todo bien: no avisa a nadie", async () => {
    const r = await revisarSaludDeMeta(deps());
    // Recorre todas las oficinas: aquí solo importa que esta página no tenga problemas.
    assert.ok(!r.problemas.some((x) => x.pagina === "Taller en Facebook"));
    assert.deepEqual((({ estado, suscrita, ultimo_error }) => ({ estado, suscrita, ultimo_error }))(await leerPagina()), { estado: "activa", suscrita: true, ultimo_error: null });
    assert.equal((await avisos()).length, 0);
  });

  it("si la página pierde la suscripción, se recupera sola", async () => {
    meta.suscrita = false;
    const r = await revisarSaludDeMeta(deps());
    assert.equal(r.resuscritas, 1);
    assert.equal(meta.suscrita, true);
    assert.equal((await avisos()).length, 0);
  });

  it("si no se puede recuperar: la marca, avisa con qué hacer y alerta a MyOfia, sin repetir el aviso al día siguiente", async () => {
    meta.suscrita = false; meta.resuscribirFalla = true;
    await revisarSaludDeMeta(deps());
    assert.deepEqual(await leerPagina(), { estado: "activa", suscrita: false, ultimo_error: "suscripcion_perdida", alerta_sin_leads_en: null });
    assert.match((await avisos()).at(-1)!.titulo as string, /dejado de avisarnos/);
    assert.equal((await alertasAbiertas()).length, 1);
    await revisarSaludDeMeta(deps());
    assert.equal((await avisos()).length, 1, "el mismo problema no se avisa dos veces");
    assert.equal((await leerPagina()).ultimo_error, "suscripcion_perdida", "y no se borra el aviso mientras siga");
    meta.resuscribirFalla = false; meta.suscrita = true;
    await db.rpc("meta_pagina_actualizar", { p_company_id: EMPRESA, p_id: paginaId, p_estado: "activa", p_suscrita: true, p_error: null });
  });

  it("acceso a leads limitado: la marca y, cuando se arregla, vuelve sola a recibir y cierra la alerta", async () => {
    meta.leadsSinAcceso = true;
    await revisarSaludDeMeta(deps());
    assert.deepEqual((({ estado, ultimo_error }) => ({ estado, ultimo_error }))(await leerPagina()), { estado: "sin_permiso_leads", ultimo_error: "acceso_leads" });
    assert.match((await avisos()).at(-1)!.titulo as string, /limita el acceso/);
    meta.leadsSinAcceso = false;
    await revisarSaludDeMeta(deps());
    assert.deepEqual((({ estado, suscrita, ultimo_error }) => ({ estado, suscrita, ultimo_error }))(await leerPagina()), { estado: "activa", suscrita: true, ultimo_error: null });
    assert.equal((await alertasAbiertas()).length, 0, "la alerta de MyOfia se cierra sola");
  });

  it("varios días sin leads con un anuncio activo: alerta una vez por semana; con el anuncio pausado, no", async () => {
    await db.from("meta_pages").update({ ultimo_lead_en: new Date(Date.now() - 5 * 86_400_000).toISOString(), alerta_sin_leads_en: null }).eq("id", paginaId);
    meta.anuncioActivo = false;
    await revisarSaludDeMeta(deps());
    assert.equal((await leerPagina()).alerta_sin_leads_en, null);
    meta.anuncioActivo = true;
    await revisarSaludDeMeta(deps());
    assert.ok((await leerPagina()).alerta_sin_leads_en);
    assert.match((await avisos()).at(-1)!.titulo as string, /no recibe leads aunque tus anuncios siguen activos/);
    const n = (await avisos()).length;
    await revisarSaludDeMeta(deps());
    assert.equal((await avisos()).length, n, "no se repite al día siguiente");
  });

  it("permisos que faltan en la cuenta: avisa una vez", async () => {
    meta.permisos = meta.permisos.filter((p) => p !== "leads_retrieval");
    const r = await revisarSaludDeMeta(deps());
    assert.ok(r.problemas.some((p) => p.problema === "faltan_permisos"));
    const n = (await avisos()).length;
    await revisarSaludDeMeta(deps());
    assert.equal((await avisos()).length, n);
    meta.permisos.push("leads_retrieval");
    await revisarSaludDeMeta(deps());
  });

  it("permiso de la página caducado: la marca y pide volver a conectar", async () => {
    meta.tokenPaginaCaducado = true;
    await revisarSaludDeMeta(deps());
    meta.tokenPaginaCaducado = false;
    assert.equal((await leerPagina()).estado, "token_caducado");
    assert.match((await avisos()).at(-1)!.titulo as string, /ha caducado/);
  });
});

describe("avisos de Facebook firmados", () => {
  it("una firma falsa no desconecta nada", async () => {
    const falso = `${Buffer.from("x".repeat(32)).toString("base64url")}.${Buffer.from(JSON.stringify({ algorithm: "HMAC-SHA256", user_id: FB_USUARIO })).toString("base64url")}`;
    const r = await avisoDeFacebook({ db, env: ENV, log: silencio }, "desautorizar", peticionFirmada(falso));
    assert.equal(r.status, 400);
    assert.equal((await db.from("company_connections").select("estado").eq("id", conexion).single()).data!.estado, "conectado");
  });

  it("eliminación de datos: desconecta, borra sus páginas y devuelve la URL de estado y el código; los leads se quedan", async () => {
    const { count: leadsAntes } = await db.from("meta_lead_events").select("id", { count: "exact", head: true }).eq("company_id", EMPRESA);
    const r = await avisoDeFacebook({ db, env: ENV, log: silencio }, "eliminar", peticionFirmada(firmar({ algorithm: "HMAC-SHA256", user_id: FB_USUARIO, issued_at: 1 })));
    assert.equal(r.status, 200);
    const cuerpo = await r.json() as { url: string; confirmation_code: string };
    assert.match(cuerpo.confirmation_code, /^[0-9a-f]{32}$/);
    assert.equal(cuerpo.url, `https://app.test/eliminacion-datos/${cuerpo.confirmation_code}`);
    const { data: c } = await db.from("company_connections").select("estado, token_ref, id_externo, cuenta_externa").eq("id", conexion).single();
    assert.deepEqual(c, { estado: "desconectado", token_ref: null, id_externo: null, cuenta_externa: null });
    assert.equal((await db.from("meta_pages").select("id").eq("company_id", EMPRESA).eq("page_id", PAGINA)).data!.length, 0);
    const { count: leadsDespues } = await db.from("meta_lead_events").select("id", { count: "exact", head: true }).eq("company_id", EMPRESA);
    assert.equal(leadsDespues, leadsAntes, "los leads ya recibidos son de la empresa");
    const { data: s } = await db.from("meta_data_deletion_requests").select("estado, conexiones").eq("codigo", cuerpo.confirmation_code).single();
    assert.deepEqual(s, { estado: "completada", conexiones: 1 });
    assert.match((await avisos()).at(-1)!.titulo as string, /Facebook se ha desconectado/);
  });
});
