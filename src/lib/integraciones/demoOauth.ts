/**
 * Proveedor «demo»: un OAuth 2.0 falso (código + PKCE S256 + renovación + revocación) que corre en la propia aplicación, para probar
 * todo el flujo y la interfaz sin cuentas reales. SOLO LOCAL: con CONEXIONES_DEMO=true y nunca en producción (todo responde 404 si no).
 * Los códigos y tokens son «firmados» (HMAC) y sin estado; la lista de revocados vive en memoria (se pierde al reiniciar: es una demo).
 */
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { demoHabilitado, redirectUri, urlDeLaApp, type Env } from "./proveedores.ts";
import { desafioS256, secretoDeEstado } from "./estado.ts";

export const CLIENTE_DEMO = "demo-client";
const revocados = new Set<string>();
const codigosUsados = new Set<string>();

const b64 = (s: string | Buffer) => Buffer.from(s).toString("base64url");
function secretoDemo(env: Env): string | null {
  const base = secretoDeEstado(env);
  return base ? createHmac("sha256", base).update("proveedor-demo").digest("hex") : null;
}
function firmar(prefijo: string, carga: object, env: Env): string {
  const s = secretoDemo(env)!;
  const cuerpo = b64(JSON.stringify(carga));
  return `${prefijo}_${cuerpo}.${createHmac("sha256", s).update(prefijo + cuerpo).digest("base64url")}`;
}
function abrir<T>(prefijo: string, token: string, env: Env): T | null {
  const s = secretoDemo(env);
  if (!s || !token.startsWith(`${prefijo}_`) || token.length > 4000) return null;
  const [cuerpo, f] = token.slice(prefijo.length + 1).split(".");
  if (!cuerpo || !f) return null;
  const esperada = createHmac("sha256", s).update(prefijo + cuerpo).digest();
  const dada = Buffer.from(f, "base64url");
  if (dada.length !== esperada.length || !timingSafeEqual(dada, esperada)) return null;
  try { return JSON.parse(Buffer.from(cuerpo, "base64url").toString("utf8")) as T; } catch { return null; }
}

export const ttlTokenDemo = (env: Env) => Math.max(5, Number(env.DEMO_TOKEN_TTL_SEGUNDOS) || 3600);
export const demoActivo = (env: Env = process.env) => demoHabilitado(env) && secretoDemo(env) !== null;

type CargaCodigo = { cl: string; ru: string; ch: string | null; sc: string; e: number; j: string };
type CargaToken = { j: string; sc: string; e: number; cuenta: string };

/** Pantalla de «Autorizar»: comprueba que lo recibido es un flujo legítimo. El `redirect_uri` debe ser EXACTAMENTE el de esta aplicación (sin redirecciones abiertas). */
export function validarSolicitud(q: { client_id?: string; redirect_uri?: string; response_type?: string; state?: string; code_challenge?: string; code_challenge_method?: string }, env: Env = process.env): string | null {
  if (!demoActivo(env)) return "La aplicación de demostración no está activada.";
  const app = urlDeLaApp(env);
  if (q.client_id !== CLIENTE_DEMO) return "client_id desconocido.";
  if (!app || q.redirect_uri !== redirectUri("demo", app)) return "redirect_uri no permitido.";
  if (q.response_type !== "code") return "response_type no admitido.";
  if (!q.state || q.state.length > 2000) return "Falta el state.";
  if (q.code_challenge && q.code_challenge_method !== "S256") return "Solo se admite PKCE S256.";
  return null;
}

export function emitirCodigo(q: { redirect_uri: string; code_challenge?: string; scope?: string }, env: Env, ahora = Date.now()): string {
  const carga: CargaCodigo = { cl: CLIENTE_DEMO, ru: q.redirect_uri, ch: q.code_challenge ?? null, sc: q.scope ?? "cuenta.leer", e: ahora + 5 * 60_000, j: randomUUID() };
  return firmar("dc", carga, env);
}

export type RespuestaTokenDemo = { access_token: string; refresh_token: string; token_type: "Bearer"; expires_in: number; scope: string; account_label: string };
const emitirTokens = (sc: string, env: Env, ahora: number): RespuestaTokenDemo => {
  const ttl = ttlTokenDemo(env);
  const cuenta = "Cuenta demo (demo@oficina.example)";
  return {
    access_token: firmar("dat", { j: randomUUID(), sc, e: ahora + ttl * 1000, cuenta } satisfies CargaToken, env),
    refresh_token: firmar("drt", { j: randomUUID(), sc, e: ahora + 30 * 24 * 3600_000, cuenta } satisfies CargaToken, env),
    token_type: "Bearer", expires_in: ttl, scope: sc, account_label: cuenta,
  };
};

export type ResultadoToken = { status: 200; cuerpo: RespuestaTokenDemo } | { status: 400 | 401; cuerpo: { error: string } };

/** Endpoint de token: `authorization_code` (con PKCE) y `refresh_token` (rota el refresh token). */
export function canjear(f: URLSearchParams, env: Env = process.env, ahora = Date.now()): ResultadoToken {
  const err = (status: 400 | 401, error: string): ResultadoToken => ({ status, cuerpo: { error } });
  if (!demoActivo(env)) return err(400, "unsupported");
  if (f.get("client_id") !== CLIENTE_DEMO || f.get("client_secret") !== (env.CONEXION_DEMO_CLIENT_SECRET || "demo-secret")) return err(401, "invalid_client");
  if (f.get("grant_type") === "authorization_code") {
    const c = abrir<CargaCodigo>("dc", f.get("code") ?? "", env);
    if (!c || c.e < ahora || codigosUsados.has(c.j)) return err(400, "invalid_grant");
    if (c.ru !== f.get("redirect_uri")) return err(400, "invalid_grant");
    if (c.ch) {
      const v = f.get("code_verifier") ?? "";
      if (!v || desafioS256(v) !== c.ch) return err(400, "invalid_grant");
    }
    codigosUsados.add(c.j);
    return { status: 200, cuerpo: emitirTokens(c.sc, env, ahora) };
  }
  if (f.get("grant_type") === "refresh_token") {
    const t = abrir<CargaToken>("drt", f.get("refresh_token") ?? "", env);
    if (!t || t.e < ahora || revocados.has(t.j)) return err(400, "invalid_grant");
    revocados.add(t.j); // el refresh token rota: el anterior ya no vale
    return { status: 200, cuerpo: emitirTokens(t.sc, env, ahora) };
  }
  return err(400, "unsupported_grant_type");
}

/** RFC 7009: revoca un token (siempre 200, como pide el estándar). */
export function revocar(f: URLSearchParams, env: Env = process.env): void {
  if (!demoActivo(env) || f.get("client_id") !== CLIENTE_DEMO) return;
  const token = f.get("token") ?? "";
  const t = abrir<CargaToken>("dat", token, env) ?? abrir<CargaToken>("drt", token, env);
  if (t) revocados.add(t.j);
}

/** «API» de la aplicación demo: devuelve la cuenta del token (lo que usa la herramienta `consultar_cuenta_demo`). */
export function cuentaDelToken(authorization: string | null, env: Env = process.env, ahora = Date.now()): { cuenta: string; scopes: string[] } | null {
  if (!demoActivo(env)) return null;
  const t = abrir<CargaToken>("dat", /^Bearer (.+)$/.exec(authorization ?? "")?.[1] ?? "", env);
  if (!t || t.e < ahora || revocados.has(t.j)) return null;
  return { cuenta: t.cuenta, scopes: t.sc.split(" ") };
}

export const _reiniciarDemoParaTests = () => { revocados.clear(); codigosUsados.clear(); };
