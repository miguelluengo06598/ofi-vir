/** Meta Lead Ads sin red ni base: avisos firmados, cliente de la Graph API y conexión con Facebook simulado. Ejecutar: npm test */
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { describe, it } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { clasificarError, graph, graphLista, pruebaDeSecreto } from "./meta/graph.ts";
import { completarConexionMeta } from "./meta/servicio.ts";
import { firmaValida, recibirAvisos, verificarSuscripcion } from "./meta/webhook.ts";
import { firmarEstado } from "./estado.ts";
import type { DepsConexiones } from "./servicio.ts";

const SECRETO = "secreto-de-la-app-de-prueba";
const ENV = {
  META_APP_ID: "123456789012345", META_APP_SECRET: SECRETO, META_LOGIN_CONFIG_ID: "987654321098765", META_GRAPH_VERSION: "v26.0",
  META_WEBHOOK_VERIFY_TOKEN: "token-de-verificacion-123456", CONEXIONES_STATE_SECRET: "x".repeat(40), APP_URL: "https://app.test",
};
const silencio = { info() {}, warn() {}, error() {} };
const firmar = (cuerpo: string) => `sha256=${createHmac("sha256", SECRETO).update(cuerpo).digest("hex")}`;
const cab = (h: Record<string, string>) => ({ get: (k: string) => h[k.toLowerCase()] ?? null });

describe("avisos de Meta: verificación de la dirección", () => {
  const url = (q: Record<string, string>) => new URL(`https://app.test/api/webhooks/meta?${new URLSearchParams(q)}`);
  it("devuelve el reto solo con el token correcto", async () => {
    const r = verificarSuscripcion(url({ "hub.mode": "subscribe", "hub.verify_token": ENV.META_WEBHOOK_VERIFY_TOKEN, "hub.challenge": "1158201444" }), ENV);
    assert.equal(r.status, 200);
    assert.equal(await r.text(), "1158201444");
  });
  it("rechaza un token incorrecto, otro modo o un reto raro", () => {
    assert.equal(verificarSuscripcion(url({ "hub.mode": "subscribe", "hub.verify_token": "otro", "hub.challenge": "1" }), ENV).status, 403);
    assert.equal(verificarSuscripcion(url({ "hub.mode": "unsubscribe", "hub.verify_token": ENV.META_WEBHOOK_VERIFY_TOKEN, "hub.challenge": "1" }), ENV).status, 403);
    assert.equal(verificarSuscripcion(url({ "hub.mode": "subscribe", "hub.verify_token": ENV.META_WEBHOOK_VERIFY_TOKEN, "hub.challenge": "<script>" }), ENV).status, 403);
  });
  it("sin token configurado (o corto) no verifica nada", () => {
    assert.equal(verificarSuscripcion(url({ "hub.mode": "subscribe", "hub.verify_token": "", "hub.challenge": "1" }), { ...ENV, META_WEBHOOK_VERIFY_TOKEN: "" }).status, 503);
    assert.equal(verificarSuscripcion(url({ "hub.mode": "subscribe", "hub.verify_token": "corto", "hub.challenge": "1" }), { ...ENV, META_WEBHOOK_VERIFY_TOKEN: "corto" }).status, 503);
  });
});

describe("avisos de Meta: leads nuevos", () => {
  const aviso = (cambios: unknown[]) => JSON.stringify({ object: "page", entry: [{ id: "111", time: 1, changes: cambios }] });
  const lead = (id: string) => ({ field: "leadgen", value: { leadgen_id: id, page_id: "111", form_id: "222", ad_id: "333", adgroup_id: "444", created_time: 1_700_000_000 } });
  function base() {
    const llamadas: Record<string, unknown>[] = [];
    const vistos = new Set<string>();
    const db = {
      rpc: async (_fn: string, args: Record<string, unknown>) => {
        llamadas.push(args);
        const nuevo = !vistos.has(args.p_leadgen_id as string);
        vistos.add(args.p_leadgen_id as string);
        return { data: { nuevo, estado: "recibido" }, error: null };
      },
    } as unknown as SupabaseClient;
    return { deps: { db, env: ENV, log: silencio }, llamadas };
  }

  it("sin firma, o con una firma falsa, no guarda nada", async () => {
    const { deps, llamadas } = base();
    const cuerpo = aviso([lead("1")]);
    assert.equal((await recibirAvisos(deps, cuerpo, cab({}))).status, 401);
    assert.equal((await recibirAvisos(deps, cuerpo, cab({ "x-hub-signature-256": "sha256=" + "0".repeat(64) }))).status, 401);
    assert.equal((await recibirAvisos(deps, cuerpo, cab({ "x-hub-signature-256": firmar(cuerpo + " ") }))).status, 401, "la firma es del cuerpo exacto");
    assert.equal(llamadas.length, 0);
  });

  it("con firma válida registra solo identificadores y los repetidos no cuentan dos veces", async () => {
    const { deps, llamadas } = base();
    const cuerpo = aviso([lead("1"), lead("2"), lead("1"), { field: "feed", value: {} }, { field: "leadgen", value: { leadgen_id: "x; drop", page_id: "111" } }]);
    const r = await recibirAvisos(deps, cuerpo, cab({ "x-hub-signature-256": firmar(cuerpo) }));
    assert.equal(r.status, 200);
    assert.deepEqual(await r.json(), { estado: "recibido", nuevos: 2, repetidos: 1, descartados: 1 });
    assert.equal(llamadas.length, 3);
    assert.deepEqual(Object.keys(llamadas[0]).sort(), ["p_ad_id", "p_adgroup_id", "p_created_time", "p_form_id", "p_leadgen_id", "p_page_id"]);
    assert.equal(llamadas[0].p_created_time, "2023-11-14T22:13:20.000Z");
  });

  it("un aviso que no es de páginas se ignora sin error (para que Meta no reintente)", async () => {
    const { deps, llamadas } = base();
    const cuerpo = JSON.stringify({ object: "instagram", entry: [] });
    assert.equal((await recibirAvisos(deps, cuerpo, cab({ "x-hub-signature-256": firmar(cuerpo) }))).status, 200);
    assert.equal(llamadas.length, 0);
  });

  it("firmaValida exige el formato sha256=<64 hex>", () => {
    assert.equal(firmaValida("{}", firmar("{}"), SECRETO), true);
    assert.equal(firmaValida("{}", firmar("{}").toUpperCase(), SECRETO), false);
    assert.equal(firmaValida("{}", "sha1=abc", SECRETO), false);
  });
});

describe("cliente de la Graph API", () => {
  it("manda el token en la cabecera (nunca en la URL) con appsecret_proof", async () => {
    let visto: { url: string; init: RequestInit } | null = null;
    const fetchFalso = (async (url: string, init: RequestInit) => { visto = { url, init }; return Response.json({ id: "1" }); }) as unknown as typeof fetch;
    await graph({ fetch: fetchFalso, env: ENV }, "me", { token: "TOKEN-SECRETO-123", params: { fields: "name" } });
    assert.ok(visto);
    const { url, init } = visto as { url: string; init: RequestInit };
    assert.ok(url.startsWith("https://graph.facebook.com/v26.0/me?"));
    assert.ok(!url.includes("TOKEN-SECRETO-123"), "el token no va en la URL");
    assert.equal((init.headers as Record<string, string>).authorization, "Bearer TOKEN-SECRETO-123");
    assert.equal(new URL(url).searchParams.get("appsecret_proof"), pruebaDeSecreto("TOKEN-SECRETO-123", SECRETO));
  });

  it("no acepta rutas con caracteres raros ni sin configuración", async () => {
    const f = (async () => Response.json({})) as unknown as typeof fetch;
    await assert.rejects(graph({ fetch: f, env: ENV }, "me?x=1", { token: "t" }), { tipo: "otro" });
    await assert.rejects(graph({ fetch: f, env: { ...ENV, META_GRAPH_VERSION: "" } }, "me", { token: "t" }), { tipo: "sin_configurar" });
  });

  it("clasifica los errores de Meta sin guardar su mensaje", () => {
    assert.equal(clasificarError(400, { code: 190, error_subcode: 463 }).tipo, "token");
    assert.equal(clasificarError(403, { code: 200 }).tipo, "permiso");
    assert.equal(clasificarError(400, { code: 4 }).tipo, "limite");
    assert.equal(clasificarError(500, undefined).tipo, "temporal");
    assert.ok(!clasificarError(400, { code: 190 }).message.includes("token caducado por"));
  });

  it("recorre páginas por cursor, sin seguir `paging.next`", async () => {
    const urls: string[] = [];
    const respuestas = [{ data: [{ id: "1" }], paging: { cursors: { after: "C2" }, next: "https://graph.facebook.com/x?access_token=FUGA" } }, { data: [{ id: "2" }], paging: { cursors: { after: "C3" } } }];
    const f = (async (url: string) => { urls.push(url); return Response.json(respuestas.shift()); }) as unknown as typeof fetch;
    assert.deepEqual(await graphLista<{ id: string }>({ fetch: f, env: ENV }, "me/accounts", { token: "t" }), [{ id: "1" }, { id: "2" }]);
    assert.equal(new URL(urls[1]).searchParams.get("after"), "C2");
    assert.ok(urls.every((u) => !u.includes("FUGA")));
  });
});

describe("conectar Facebook (Facebook y base simulados)", () => {
  const COMPANY = "11111111-1111-4111-8111-111111111111", USER = "22222222-2222-4222-8222-222222222222", NONCE = "33333333-3333-4333-8333-333333333333";
  const ahora = new Date("2026-11-12T10:00:00Z");
  const state = () => firmarEstado({ n: NONCE, c: COMPANY, u: USER, p: "meta_leads", e: ahora.getTime() + 60_000 }, ENV.CONEXIONES_STATE_SECRET);

  function montar(permisos: string[], paginas: { id: string; name: string; access_token: string; tasks?: string[] }[], otraEmpresa = new Set<string>()) {
    const rpcs: { fn: string; args: Record<string, unknown> }[] = [];
    const db = {
      rpc: async (fn: string, args: Record<string, unknown>) => {
        rpcs.push({ fn, args });
        if (fn === "conexion_consumir_estado") return { data: [{ code_verifier: null }], error: null };
        if (fn === "conexion_guardar") return { data: "44444444-4444-4444-8444-444444444444", error: null };
        if (fn === "meta_pagina_conectar") return { data: otraEmpresa.has(args.p_page_id as string) ? { ok: false, motivo: "pagina_en_otra_empresa" } : { ok: true, id: `pagina-${args.p_page_id}` }, error: null };
        return { data: true, error: null };
      },
      from: () => {
        const q = { select: () => q, eq: () => q, neq: () => q, is: () => q, update: () => q, maybeSingle: async () => ({ data: null }), then: (r: (v: unknown) => void) => r({ data: [], error: null }) };
        return q;
      },
    } as unknown as SupabaseClient;
    const pedidas: string[] = [];
    const fetchFalso = (async (url: string, init: RequestInit) => {
      const u = new URL(url);
      pedidas.push(`${init.method ?? "GET"} ${u.pathname}`);
      if (u.pathname.endsWith("/oauth/access_token")) {
        const cuerpo = new URLSearchParams(String(init.body));
        return Response.json({ access_token: cuerpo.get("grant_type") === "fb_exchange_token" ? "TOKEN-LARGO-xxxxxxxxxxxxxxxx" : "TOKEN-CORTO-xxxxxxxxxxxxxxxx", token_type: "bearer" });
      }
      if (u.pathname.endsWith("/me/permissions")) return Response.json({ data: permisos.map((p) => ({ permission: p, status: "granted" })) });
      if (u.pathname.endsWith("/me/accounts")) return Response.json({ data: paginas });
      if (u.pathname.endsWith("/me")) return Response.json({ name: "Ana Prueba" });
      return Response.json({ error: { code: 100 } }, { status: 400 });
    }) as unknown as typeof fetch;
    const d: DepsConexiones = { db, env: ENV, fetch: fetchFalso, ahora: () => ahora, log: silencio };
    return { d, rpcs, pedidas };
  }
  const TODOS = ["leads_retrieval", "pages_manage_metadata", "pages_show_list", "pages_read_engagement", "ads_management", "pages_manage_ads"];

  it("guarda el token de larga duración y los de página cifrados, y nunca devuelve un token", async () => {
    const { d, rpcs, pedidas } = montar(TODOS, [{ id: "111", name: "Clínica Sol", access_token: "TOKEN-PAGINA-111-xxxxxxxx", tasks: ["ADVERTISE", "MANAGE"] }]);
    const r = await completarConexionMeta(d, { companyId: COMPANY, userId: USER, state: state(), code: "codigo" });
    assert.deepEqual(r, { resultado: "ok", paginas: 1, enOtraOficina: 0, faltan: [] });
    const guardada = rpcs.find((x) => x.fn === "conexion_guardar")!;
    assert.match(guardada.args.p_secreto as string, /TOKEN-LARGO/, "se guarda el de larga duración, no el corto");
    assert.equal(guardada.args.p_caduca, null);
    assert.equal(rpcs.find((x) => x.fn === "meta_pagina_conectar")!.args.p_secreto, "TOKEN-PAGINA-111-xxxxxxxx");
    assert.ok(!JSON.stringify(r).includes("TOKEN"));
    assert.ok(pedidas.includes("POST /v26.0/oauth/access_token"));
  });

  it("si falta un permiso imprescindible no conecta páginas y dice cuáles faltan", async () => {
    const { d, rpcs } = montar(TODOS.filter((p) => p !== "leads_retrieval"), [{ id: "111", name: "Clínica Sol", access_token: "TOKEN-PAGINA-111-xxxxxxxx" }]);
    const r = await completarConexionMeta(d, { companyId: COMPANY, userId: USER, state: state(), code: "codigo" });
    assert.equal(r.resultado, "faltan_permisos");
    assert.deepEqual(r.faltan, ["leads_retrieval"]);
    assert.equal(rpcs.filter((x) => x.fn === "meta_pagina_conectar").length, 0);
  });

  it("una página de otra oficina no se conecta (queda en revisión) y sin tarea de anunciar se avisa", async () => {
    const { d, rpcs } = montar(TODOS, [
      { id: "111", name: "Clínica Sol", access_token: "TOKEN-PAGINA-111-xxxxxxxx", tasks: ["MANAGE"] },
      { id: "222", name: "Otra", access_token: "TOKEN-PAGINA-222-xxxxxxxx", tasks: ["ADVERTISE"] },
    ], new Set(["222"]));
    const r = await completarConexionMeta(d, { companyId: COMPANY, userId: USER, state: state(), code: "codigo" });
    assert.deepEqual([r.paginas, r.enOtraOficina], [1, 1]);
    const aviso = rpcs.find((x) => x.fn === "meta_pagina_actualizar" && x.args.p_error === "no_puede_anunciar");
    assert.ok(aviso, "la página sin ADVERTISE queda avisada");
  });
});

describe("avisos firmados de Facebook (signed_request)", async () => {
  const { leerSignedRequest } = await import("./meta/mantenimiento.ts");
  const firmar = (carga: object, secreto = SECRETO) => {
    const datos = Buffer.from(JSON.stringify(carga)).toString("base64url");
    return `${createHmac("sha256", secreto).update(datos).digest("base64url")}.${datos}`;
  };
  it("acepta solo la firma de nuestra app con HMAC-SHA256 y un id numérico", () => {
    assert.deepEqual(leerSignedRequest(firmar({ algorithm: "HMAC-SHA256", user_id: "1234567", issued_at: 9 }), SECRETO), { user_id: "1234567", issued_at: 9 });
    assert.equal(leerSignedRequest(firmar({ algorithm: "HMAC-SHA256", user_id: "1234567" }, "otro-secreto"), SECRETO), null);
    assert.equal(leerSignedRequest(firmar({ algorithm: "plain", user_id: "1234567" }), SECRETO), null);
    assert.equal(leerSignedRequest(firmar({ algorithm: "HMAC-SHA256", user_id: "1; drop" }), SECRETO), null);
    assert.equal(leerSignedRequest("sin-punto", SECRETO), null);
    assert.equal(leerSignedRequest(`${firmar({ algorithm: "HMAC-SHA256", user_id: "1" })}.extra`, SECRETO), null);
  });
});
