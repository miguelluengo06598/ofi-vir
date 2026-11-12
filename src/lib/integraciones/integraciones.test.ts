import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { REGISTRO } from "../agentes/herramientas/registro.ts";
import { _reiniciarDemoParaTests, canjear, cuentaDelToken, emitirCodigo, revocar, validarSolicitud } from "./demoOauth.ts";
import { desafioS256, firmarEstado, nuevoVerificador, secretoDeEstado, verificarEstado, VIDA_DEL_ESTADO_MS } from "./estado.ts";
import { configuracionOAuth, estaDisponible, fichaDeProveedor, herramientasQueHabilita, obtenerProveedor, PROVEEDORES, redirectUri } from "./proveedores.ts";

const SECRETO = "s".repeat(40);
const ENV = { CONEXIONES_STATE_SECRET: SECRETO, CONEXIONES_DEMO: "true", APP_URL: "http://localhost:3000", NODE_ENV: "test" } as Record<string, string>;
const U = "11111111-1111-4111-8111-111111111111";
const carga = (e = Date.now() + VIDA_DEL_ESTADO_MS) => ({ n: U, c: U, u: U, p: "demo", e });

describe("state firmado", () => {
  it("un state válido se verifica", () => {
    const r = verificarEstado(firmarEstado(carga(), SECRETO), SECRETO);
    assert.ok(r.ok);
  });
  it("manipular la carga, la firma o usar otro secreto se rechaza", () => {
    const s = firmarEstado(carga(), SECRETO);
    const [cuerpo, firma] = s.split(".");
    const otra = Buffer.from(JSON.stringify({ ...carga(), c: "22222222-2222-4222-8222-222222222222" })).toString("base64url");
    assert.deepEqual(verificarEstado(`${otra}.${firma}`, SECRETO), { ok: false, motivo: "firma" });
    assert.deepEqual(verificarEstado(`${cuerpo}.${firma.slice(0, -2)}AA`, SECRETO), { ok: false, motivo: "firma" });
    assert.deepEqual(verificarEstado(s, "otro".repeat(12)), { ok: false, motivo: "firma" });
  });
  it("basura y estados caducados se rechazan", () => {
    for (const x of ["", "a", "a.b", "...", "x".repeat(5000)]) assert.equal(verificarEstado(x, SECRETO).ok, false);
    assert.deepEqual(verificarEstado(firmarEstado(carga(Date.now() - 1), SECRETO), SECRETO), { ok: false, motivo: "caducado" });
  });
  it("sin secreto (o corto) no hay conexiones", () => {
    assert.equal(secretoDeEstado({}), null);
    assert.equal(secretoDeEstado({ CONEXIONES_STATE_SECRET: "corto" }), null);
  });
  it("PKCE S256: el desafío es el hash del verificador", () => {
    const v = nuevoVerificador();
    assert.equal(desafioS256(v), desafioS256(v));
    assert.notEqual(desafioS256(v), desafioS256(nuevoVerificador()));
  });
});

describe("registro de proveedores", () => {
  it("toda integración que pide una herramienta tiene proveedor, y viceversa se derivan de ahí", () => {
    for (const h of REGISTRO) if (h.integracion) assert.ok(obtenerProveedor(h.integracion), `falta el proveedor de ${h.id}`);
    assert.ok(herramientasQueHabilita("demo").some((h) => h.id === "consultar_cuenta_demo"));
  });
  it("ids únicos, con tipo de auth válido y sin secretos en la ficha pública", () => {
    assert.equal(new Set(PROVEEDORES.map((p) => p.id)).size, PROVEEDORES.length);
    const env = { ...ENV, CONEXION_HUBSPOT_CLIENT_SECRET: "SECRETO-HUBSPOT", CONEXION_HUBSPOT_CLIENT_ID: "id", CONEXION_HUBSPOT_AUTH_URL: "https://a.example/auth", CONEXION_HUBSPOT_TOKEN_URL: "https://a.example/t" };
    for (const p of PROVEEDORES) assert.ok(["oauth2", "api_key", "dominio"].includes(p.tipoAuth));
    assert.ok(!JSON.stringify(PROVEEDORES.map((p) => fichaDeProveedor(p, env))).includes("SECRETO-HUBSPOT"));
  });
  it("el demo solo está disponible con CONEXIONES_DEMO y nunca en producción; los reales piden su configuración", () => {
    const demo = obtenerProveedor("demo")!;
    assert.ok(estaDisponible(demo, ENV));
    assert.ok(!estaDisponible(demo, { ...ENV, CONEXIONES_DEMO: "" }));
    assert.ok(!estaDisponible(demo, { ...ENV, NODE_ENV: "production" }));
    assert.ok(!estaDisponible(obtenerProveedor("hubspot")!, ENV));
    assert.equal(configuracionOAuth(obtenerProveedor("hubspot")!, { ...ENV, CONEXION_HUBSPOT_AUTH_URL: "http://malo.example/a", CONEXION_HUBSPOT_TOKEN_URL: "http://malo.example/t", CONEXION_HUBSPOT_CLIENT_ID: "x" }), null);
  });
});

describe("proveedor demo (OAuth falso)", () => {
  beforeEach(() => _reiniciarDemoParaTests());
  const RU = redirectUri("demo", "http://localhost:3000");
  const flujo = () => {
    const v = nuevoVerificador();
    const code = emitirCodigo({ redirect_uri: RU, code_challenge: desafioS256(v) }, ENV);
    return { v, code };
  };
  const canje = (p: Record<string, string>) => canjear(new URLSearchParams({ client_id: "demo-client", client_secret: "demo-secret", ...p }), ENV);

  it("valida la solicitud: redirect_uri exacto, PKCE S256", () => {
    const ok = { client_id: "demo-client", redirect_uri: RU, response_type: "code", state: "x", code_challenge: "c", code_challenge_method: "S256" };
    assert.equal(validarSolicitud(ok, ENV), null);
    assert.ok(validarSolicitud({ ...ok, redirect_uri: "https://evil.example/cb" }, ENV));
    assert.ok(validarSolicitud({ ...ok, code_challenge_method: "plain" }, ENV));
    assert.ok(validarSolicitud(ok, { ...ENV, CONEXIONES_DEMO: "" }));
  });
  it("código + verificador correcto da tokens; verificador falso o código reutilizado, no", () => {
    const { v, code } = flujo();
    assert.equal(canje({ grant_type: "authorization_code", code, redirect_uri: RU, code_verifier: "falso" }).status, 400);
    const r = canje({ grant_type: "authorization_code", code, redirect_uri: RU, code_verifier: v });
    assert.equal(r.status, 200);
    assert.equal(canje({ grant_type: "authorization_code", code, redirect_uri: RU, code_verifier: v }).status, 400);
  });
  it("el refresh rota (el anterior deja de valer) y revocar invalida el token", () => {
    const { v, code } = flujo();
    const t = canje({ grant_type: "authorization_code", code, redirect_uri: RU, code_verifier: v });
    assert.equal(t.status, 200);
    if (t.status !== 200) return;
    const n = canje({ grant_type: "refresh_token", refresh_token: t.cuerpo.refresh_token });
    assert.equal(n.status, 200);
    assert.equal(canje({ grant_type: "refresh_token", refresh_token: t.cuerpo.refresh_token }).status, 400);
    if (n.status !== 200) return;
    assert.ok(cuentaDelToken(`Bearer ${n.cuerpo.access_token}`, ENV));
    revocar(new URLSearchParams({ client_id: "demo-client", token: n.cuerpo.access_token }), ENV);
    assert.equal(cuentaDelToken(`Bearer ${n.cuerpo.access_token}`, ENV), null);
  });
  it("un cliente con secreto falso se rechaza", () => {
    assert.equal(canjear(new URLSearchParams({ client_id: "demo-client", client_secret: "no", grant_type: "refresh_token", refresh_token: "x" }), ENV).status, 401);
  });
});

describe("proveedor meta_leads", () => {
  const meta = obtenerProveedor("meta_leads")!;
  const env = { META_APP_ID: "123456789012345", META_APP_SECRET: "secreto-de-prueba", META_LOGIN_CONFIG_ID: "987654321098765", META_GRAPH_VERSION: "v26.0" };

  it("solo está disponible con la app, el secreto, la configuración de login y una versión válida", () => {
    assert.equal(estaDisponible(meta, env), true);
    for (const falta of Object.keys(env)) assert.equal(estaDisponible(meta, { ...env, [falta]: "" }), false, `sin ${falta}`);
    assert.equal(estaDisponible(meta, { ...env, META_GRAPH_VERSION: "26" }), false, "versión sin formato vNN.N");
    assert.equal(estaDisponible(meta, { ...env, META_GRAPH_VERSION: "v26.0/../x" }), false, "la versión no puede colar una ruta");
  });

  it("deriva las URLs de la versión de la Graph API y no usa las variables CONEXION_*", () => {
    const cfg = configuracionOAuth(meta, { ...env, CONEXION_META_LEADS_AUTH_URL: "https://malo.example/auth" })!;
    assert.equal(cfg.urlAutorizacion, "https://www.facebook.com/v26.0/dialog/oauth");
    assert.equal(cfg.urlToken, "https://graph.facebook.com/v26.0/oauth/access_token");
    assert.equal(cfg.clientId, env.META_APP_ID);
    assert.equal(cfg.urlRevocar, null);
  });

  it("pide los permisos con config_id y no con scope; la ficha pública no lleva secretos", () => {
    assert.equal(meta.scopesEnUrl, false);
    assert.deepEqual(meta.parametrosAutorizacion!(env), { config_id: env.META_LOGIN_CONFIG_ID });
    assert.deepEqual(meta.scopes, ["leads_retrieval", "pages_manage_metadata", "pages_show_list", "pages_read_engagement", "ads_management", "pages_manage_ads"]);
    assert.ok(!JSON.stringify(fichaDeProveedor(meta, env)).includes(env.META_APP_SECRET));
  });
});
