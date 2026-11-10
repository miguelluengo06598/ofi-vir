/**
 * Pruebas de conexiones con aplicaciones externas contra la base LOCAL real (Vault incluido), con usuarios reales de dos empresas.
 * El proveedor es el «demo»; el `fetch` inyectado enruta a sus funciones (sin servidor web). Ejecutar: npm run test:conexiones
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { createClient } from "@supabase/supabase-js";
import { autenticadorSupabase } from "../../src/lib/creditos/api.ts";
import { callbackHandler, desconectarHandler, faltantesHandler, iniciarHandler, listarHandler, type DepsApiConexiones } from "../../src/lib/integraciones/api.ts";
import { _reiniciarDemoParaTests, canjear, cuentaDelToken, revocar } from "../../src/lib/integraciones/demoOauth.ts";
import { firmarEstado } from "../../src/lib/integraciones/estado.ts";
import { lectorDeSecretos, obtenerCredenciales, type DepsConexiones } from "../../src/lib/integraciones/servicio.ts";
import { renovarConexionesPorCaducar } from "../../src/lib/integraciones/renovar.ts";
import { demoOauthEmitir } from "./ayuda.ts";
import { ejecutarHerramienta, GestorSecretos } from "../../src/lib/agentes/herramientas/index.ts";
import { SupabaseAlmacenHerramientas } from "../../src/lib/agentes/herramientas/supabaseAlmacen.ts";
import { InMemoryAgentStore } from "../../src/lib/agents/inMemoryStore.ts";
import { InMemoryStore } from "../../src/lib/memory/inMemoryStore.ts";
import { FakeEmbedder } from "../../src/lib/memory/fakeEmbedder.ts";
import { createMemoryService } from "../../src/lib/memory/service.ts";
import { altaEnEmpresa } from "../ayuda/miembros.ts";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? "";
if (!url || !key || !anon) throw new Error("Faltan variables de Supabase: ejecuta con `npm run test:conexiones` (usa .env.local).");
if (!/^https?:\/\/(127\.0\.0\.1|localhost)[:/]/.test(url)) throw new Error(`Solo contra la base LOCAL (${url} no lo es).`);

const admin = createClient(url, key, { auth: { persistSession: false } });
const RUN = Date.now().toString(36);
const ENV: Record<string, string> = { CONEXIONES_STATE_SECRET: "t".repeat(48), CONEXIONES_DEMO: "true", APP_URL: "http://localhost:3000", NODE_ENV: "test", DEMO_TOKEN_TTL_SEGUNDOS: "3600" };

// Todo lo que se escribe en consola durante las pruebas se guarda para comprobar que no hay tokens.
const consola: string[] = [];
const log = { info: (...a: unknown[]) => void consola.push(a.join(" ")), warn: (...a: unknown[]) => void consola.push(a.join(" ")), error: (...a: unknown[]) => void consola.push(a.join(" ")) };

const fetchReal = globalThis.fetch;
// «Internet» de la prueba: el proveedor demo.
let ahoraDemo = () => Date.now();
const fetchDemo: typeof fetch = async (input, init) => {
  const u = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  const cuerpo = init?.body instanceof URLSearchParams ? init.body : new URLSearchParams(String(init?.body ?? ""));
  if (u.pathname === "/api/demo-oauth/token") { const r = canjear(cuerpo, ENV, ahoraDemo()); return Response.json(r.cuerpo, { status: r.status }); }
  if (u.pathname === "/api/demo-oauth/revocar") { revocar(cuerpo, ENV); return new Response(null, { status: 200 }); }
  if (u.pathname === "/api/demo-oauth/cuenta") {
    const c = cuentaDelToken(new Headers(init?.headers).get("authorization"), ENV, ahoraDemo());
    return c ? Response.json(c) : new Response(null, { status: 401 });
  }
  return fetchReal(input, init); // todo lo demás (la base local) va por la red de verdad
};

let reloj = () => new Date();
const deps: DepsConexiones = { db: admin, env: ENV, fetch: fetchDemo, ahora: () => reloj(), log };
const api: DepsApiConexiones = { deps, autenticar: autenticadorSupabase(admin, {}) };

type Usuario = { id: string; token: string; companyId: string };
async function empresaConUsuario(etiqueta: string, role: "owner" | "member" = "owner"): Promise<Usuario> {
  const companyId = randomUUID();
  assert.ifError((await admin.from("companies").insert({ id: companyId, name: `test-conexiones ${etiqueta} ${RUN}` })).error);
  const email = `con-${etiqueta}-${RUN}@test.example`, password = `Pw-${RUN}-${etiqueta}-Aa1!`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  assert.ifError(error);
  assert.ifError((await altaEnEmpresa(admin, { id: data.user!.id, companyId, nombre: `Prueba ${etiqueta}`, email, rol: role })).error);
  const c = createClient(url, anon, { auth: { persistSession: false } });
  const s = await c.auth.signInWithPassword({ email, password });
  assert.ifError(s.error);
  return { id: data.user!.id, token: s.data.session!.access_token, companyId };
}
const req = (u: Usuario | null, ruta: string, init: RequestInit = {}) =>
  new Request(`http://localhost:3000${ruta}`, { ...init, headers: { ...(u ? { authorization: `Bearer ${u.token}` } : {}), ...(init.headers as object) } });

/** Recorre iniciar → «pantalla de Autorizar» → callback. Devuelve la respuesta del callback y el state usado. */
async function conectar(u: Usuario, quien: Usuario = u) {
  const ini = await iniciarHandler(req(u, "/api/conexiones/demo/iniciar", { headers: { accept: "application/json" } }), "demo", api);
  assert.equal(ini.status, 200);
  const { url: autorizar } = (await ini.json()) as { url: string };
  const p = new URL(autorizar).searchParams;
  const code = demoOauthEmitir({ redirect_uri: p.get("redirect_uri")!, code_challenge: p.get("code_challenge") ?? undefined, scope: p.get("scope") ?? undefined }, ENV);
  const state = p.get("state")!;
  const res = await callbackHandler(req(quien, `/api/conexiones/demo/callback?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`), "demo", api);
  return { res, state, code, autorizar };
}
const filaConexion = async (companyId: string) => (await admin.from("company_connections").select("*").eq("company_id", companyId).eq("proveedor", "demo").maybeSingle()).data as Record<string, unknown> & { id: string; estado: string; token_ref: string | null } | null;
/** Lee el secreto de Vault de una conexión (por la función SQL de servidor). undefined si ya no hay. */
const secretoDe = async (companyId: string, conexionId: string) => ((await admin.rpc("leer_token_conexion", { p_company_id: companyId, p_connection_id: conexionId })).data ?? undefined) as string | undefined;

let A: Usuario, B: Usuario, Amiembro: Usuario;
before(async () => {
  A = await empresaConUsuario("a");
  B = await empresaConUsuario("b");
  Amiembro = { ...(await empresaConUsuario("m", "member")) };
});
after(() => { /* las empresas de prueba se limpian con `supabase db reset` */ });

describe("flujo completo con el proveedor demo", () => {
  it("iniciar → autorizar → callback guarda la conexión con el secreto en Vault", async () => {
    _reiniciarDemoParaTests();
    const { res } = await conectar(A);
    assert.equal(res.status, 302);
    assert.match(res.headers.get("location") ?? "", /\/conexiones\?resultado=ok&proveedor=demo$/);
    const fila = await filaConexion(A.companyId);
    assert.equal(fila?.estado, "conectado");
    assert.ok(fila?.token_ref);
    const secreto = JSON.parse((await secretoDe(A.companyId, fila!.id))!);
    assert.ok(secreto.access_token && secreto.refresh_token);
    // En la fila de la tabla no hay ningún token.
    assert.ok(!JSON.stringify(fila).includes(secreto.access_token));
    assert.ok(!JSON.stringify(fila).includes(secreto.refresh_token));
  });

  it("obtenerCredenciales devuelve el token a esa empresa y a nadie más", async () => {
    const c = await obtenerCredenciales(deps, A.companyId, "demo");
    assert.ok(c?.token);
    assert.equal(await obtenerCredenciales(deps, B.companyId, "demo"), null);
    assert.equal(await lectorDeSecretos(deps)(B.companyId, "demo"), null);
    assert.equal(await lectorDeSecretos(deps)(A.companyId, "demo"), c!.token);
  });

  it("la lista de conexiones es de cada empresa y no contiene tokens", async () => {
    const a = await listarHandler(req(A, "/api/conexiones"), api);
    const textoA = await a.text();
    assert.equal(a.status, 200);
    assert.match(textoA, /"conectado"/);
    const tok = (await obtenerCredenciales(deps, A.companyId, "demo"))!.token;
    assert.ok(!textoA.includes(tok));
    assert.ok(!/token_ref|access_token|refresh_token/.test(textoA));
    const b = await (await listarHandler(req(B, "/api/conexiones"), api)).text();
    assert.ok(!b.includes('"conectado"'), "B no ve la conexión de A");
  });

  it("un miembro (no propietario/admin) no puede conectar", async () => {
    const r = await iniciarHandler(req(Amiembro, "/api/conexiones/demo/iniciar", { headers: { accept: "application/json" } }), "demo", api);
    assert.equal(r.status, 403);
  });
});

describe("seguridad del state", () => {
  it("un state manipulado se rechaza y no crea conexión", async () => {
    const { state, code } = await conectar(B).then(async (r) => { await admin.from("company_connections").delete().eq("company_id", B.companyId); return r; });
    const [c, f] = state.split(".");
    const falso = `${c.slice(0, -2)}AA.${f}`;
    const r = await callbackHandler(req(B, `/api/conexiones/demo/callback?code=${code}&state=${falso}`), "demo", api);
    assert.equal(r.status, 400);
    assert.equal(await filaConexion(B.companyId), null);
  });
  it("un state reutilizado se rechaza (un solo uso)", async () => {
    const C = await empresaConUsuario("c");
    const { state, code } = await conectar(C);
    const r = await callbackHandler(req(C, `/api/conexiones/demo/callback?code=${code}&state=${encodeURIComponent(state)}`), "demo", api);
    assert.equal(r.status, 400);
  });
  it("un state firmado con otro secreto o caducado se rechaza", async () => {
    const forjado = firmarEstado({ n: randomUUID(), c: B.companyId, u: B.id, p: "demo", e: Date.now() + 60_000 }, "z".repeat(48));
    assert.equal((await callbackHandler(req(B, `/api/conexiones/demo/callback?code=x&state=${forjado}`), "demo", api)).status, 400);
    const caducado = firmarEstado({ n: randomUUID(), c: B.companyId, u: B.id, p: "demo", e: Date.now() - 1000 }, ENV.CONEXIONES_STATE_SECRET);
    assert.equal((await callbackHandler(req(B, `/api/conexiones/demo/callback?code=x&state=${caducado}`), "demo", api)).status, 400);
  });
  it("el state de otra empresa o persona se rechaza (403) y no consume nada en la víctima", async () => {
    const D = await empresaConUsuario("d");
    const { res } = await conectar(D, B); // D inició; B intenta terminarlo con su sesión
    assert.equal(res.status, 403);
    assert.equal(await filaConexion(B.companyId), null);
    assert.equal(await filaConexion(D.companyId), null);
  });
  it("sin sesión no hay callback", async () => {
    assert.equal((await callbackHandler(req(null, "/api/conexiones/demo/callback?code=x&state=y"), "demo", api)).status, 401);
  });
  it("el proveedor puede denegar: vuelve con «cancelado» y sin conexión", async () => {
    const E = await empresaConUsuario("e");
    const ini = await (await iniciarHandler(req(E, "/api/conexiones/demo/iniciar", { headers: { accept: "application/json" } }), "demo", api)).json() as { url: string };
    const state = new URL(ini.url).searchParams.get("state")!;
    const r = await callbackHandler(req(E, `/api/conexiones/demo/callback?error=access_denied&state=${encodeURIComponent(state)}`), "demo", api);
    assert.equal(r.status, 302);
    assert.match(r.headers.get("location")!, /resultado=cancelado/);
    assert.equal(await filaConexion(E.companyId), null);
  });
});

describe("aislamiento entre empresas", () => {
  it("B no puede desconectar la conexión de A (404) y A sigue conectada", async () => {
    const id = (await filaConexion(A.companyId))!.id;
    const r = await desconectarHandler(req(B, `/api/conexiones/${id}/desconectar`, { method: "POST" }), id, api);
    assert.equal(r.status, 404);
    assert.equal((await filaConexion(A.companyId))?.estado, "conectado");
  });
  it("con la clave de usuario (RLS) no se lee el token_ref ni se escribe la tabla", async () => {
    const cliente = createClient(url, anon, { auth: { persistSession: false }, global: { headers: { authorization: `Bearer ${A.token}` } } });
    const r = await cliente.from("company_connections").select("token_ref");
    assert.ok(r.error, "token_ref no es legible para la empresa");
    const w = await cliente.from("company_connections").update({ estado: "conectado" }).eq("company_id", A.companyId);
    assert.ok(w.error || (w.count ?? 0) === 0);
    const v = await cliente.from("oauth_states").select("*");
    assert.ok(v.error || (v.data ?? []).length === 0);
  });
});

describe("renovación automática y caducidad", () => {
  it("renueva el token antes de que caduque y guarda el nuevo", async () => {
    const R = await empresaConUsuario("r");
    await conectar(R);
    const antes = (await obtenerCredenciales(deps, R.companyId, "demo"))!;
    reloj = () => new Date(Date.now() + 3600_000 - 60_000); // faltan 60 s: dentro del margen
    ahoraDemo = () => reloj().getTime();
    const despues = (await obtenerCredenciales(deps, R.companyId, "demo"))!;
    assert.notEqual(despues.token, antes.token);
    assert.ok(cuentaDelToken(`Bearer ${despues.token}`, ENV, ahoraDemo()));
    assert.equal((await filaConexion(R.companyId))?.estado, "conectado");
    reloj = () => new Date(); ahoraDemo = () => Date.now();
  });
  it("la tarea periódica renueva las conexiones que caducan pronto", async () => {
    const R = await empresaConUsuario("r2");
    await conectar(R);
    reloj = () => new Date(Date.now() + 3600_000 - 60_000); ahoraDemo = () => reloj().getTime();
    const r = await renovarConexionesPorCaducar(deps, R.companyId);
    assert.equal(r.renovadas, 1);
    reloj = () => new Date(); ahoraDemo = () => Date.now();
  });
  it("si la renovación falla (refresh revocado) pasa a «caducado», borra el secreto y avisa a la empresa", async () => {
    const F = await empresaConUsuario("f");
    await conectar(F);
    const fila = (await filaConexion(F.companyId))!;
    const sec = JSON.parse((await secretoDe(F.companyId, fila.id))!);
    revocar(new URLSearchParams({ client_id: "demo-client", token: sec.refresh_token }), ENV);
    reloj = () => new Date(Date.now() + 3600_000 - 60_000); ahoraDemo = () => reloj().getTime();
    assert.equal(await obtenerCredenciales(deps, F.companyId, "demo"), null);
    reloj = () => new Date(); ahoraDemo = () => Date.now();
    const despues = (await filaConexion(F.companyId))!;
    assert.equal(despues.estado, "caducado");
    assert.equal(despues.token_ref, null);
    assert.equal(await secretoDe(F.companyId, fila.id), undefined, "el secreto ya no se puede leer");
    const { data } = await admin.from("notifications").select("tipo").eq("company_id", F.companyId).eq("tipo", "conexion_caducada");
    assert.equal((data ?? []).length, 1);
  });
});

describe("desconectar y herramientas", () => {
  it("desconectar revoca el token, borra el secreto y las herramientas devuelven «integración no conectada»", async () => {
    const G = await empresaConUsuario("g");
    await conectar(G);
    const fila = (await filaConexion(G.companyId))!;
    const tok = (await obtenerCredenciales(deps, G.companyId, "demo"))!.token;
    assert.ok(cuentaDelToken(`Bearer ${tok}`, ENV));

    // Un agente de G con la herramienta demo.
    const dep = randomUUID(), ag = randomUUID();
    assert.ifError((await admin.from("departments").insert({ id: dep, company_id: G.companyId, name: "Atención", slug: `atencion-${RUN}` })).error);
    assert.ifError((await admin.from("agents").insert({ id: ag, company_id: G.companyId, department_id: dep, slug: `ag-${RUN}`, name: "Agente G", role: "Prueba", creator_name: "IDESIE" })).error);
    assert.ifError((await admin.from("agent_tools").insert({ company_id: G.companyId, agent_id: ag, tool_id: "consultar_cuenta_demo", permiso: "sola" })).error);

    const store = new InMemoryAgentStore(), memStore = new InMemoryStore();
    const memory = createMemoryService({ store: memStore, embedder: new FakeEmbedder() });
    const agente = { id: ag, slug: "g", name: "Agente G", role: "Prueba", departmentId: dep, departmentName: "Atención", model: "claude-haiku-5-5", instructions: "", allowedTools: [] };
    const ctx = () => ({
      companyId: G.companyId, agent: agente, task: { id: "t", contactId: null }, externalContent: false, memory, contacts: memStore, store, sospechas: [],
      almacen: new SupabaseAlmacenHerramientas(admin), secretos: new GestorSecretos(G.companyId, lectorDeSecretos(deps)), esSimulacion: false,
    });
    const global = globalThis.fetch;
    globalThis.fetch = fetchDemo; // la herramienta llama a la «API» del demo
    try {
      const ok = await ejecutarHerramienta(ctx() as never, "consultar_cuenta_demo", {});
      assert.equal(ok.estado, "ok", ok.texto);
      assert.ok(!ok.texto.includes(tok), "el token no llega al modelo");
      assert.equal(((await (await faltantesHandler(req(G, `/api/agentes/${ag}/integraciones`), ag, api)).json()) as { faltan: unknown[] }).faltan.length, 0);

      // Otra empresa no puede ver los faltantes de este agente.
      assert.equal((await faltantesHandler(req(B, `/api/agentes/${ag}/integraciones`), ag, api)).status, 404);

      const d = await desconectarHandler(req(G, `/api/conexiones/${fila.id}/desconectar`, { method: "POST" }), fila.id, api);
      assert.equal(d.status, 200);
      assert.equal(cuentaDelToken(`Bearer ${tok}`, ENV), null, "el token quedó revocado en el proveedor");
      assert.equal(await secretoDe(G.companyId, fila.id), undefined, "el secreto ya no está en Vault");

      const sin = await ejecutarHerramienta(ctx() as never, "consultar_cuenta_demo", {});
      assert.equal(sin.estado, "integracion_no_conectada");
      assert.match(sin.texto, /no conectada/i);

      const f = await (await faltantesHandler(req(G, `/api/agentes/${ag}/integraciones`), ag, api)).json() as { faltan: { mensaje: string }[] };
      assert.equal(f.faltan.length, 1);
      assert.match(f.faltan[0].mensaje, /^Falta conectar /);
    } finally {
      globalThis.fetch = global;
    }
  });
});

describe("el token nunca aparece en los registros", () => {
  it("ningún mensaje de log contiene tokens, códigos ni secretos", async () => {
    const tokens: string[] = [];
    for (const u of [A]) { const c = await obtenerCredenciales(deps, u.companyId, "demo"); if (c) tokens.push(c.token); }
    const fila = await filaConexion(A.companyId);
    const sec = JSON.parse((await secretoDe(A.companyId, fila!.id))!);
    tokens.push(sec.refresh_token);
    const todo = consola.join("\n");
    for (const t of tokens) assert.ok(!todo.includes(t));
    assert.ok(!/dc_|dat_|drt_/.test(todo), "ni códigos ni tokens del demo");
  });
});
