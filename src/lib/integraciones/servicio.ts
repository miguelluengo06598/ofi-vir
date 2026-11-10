/**
 * Conexiones con aplicaciones externas: flujo OAuth genérico, renovación, desconexión y credenciales. SOLO SERVIDOR.
 *  - Los tokens se guardan cifrados en Supabase Vault (funciones SQL `conexion_*`, solo service_role) y NUNCA salen de aquí:
 *    ni en respuestas de la API, ni en registros, ni en mensajes de error (los errores llevan un código, nunca el cuerpo del proveedor).
 *  - Cada consulta va en el contexto de una empresa: una empresa nunca obtiene la conexión de otra.
 */
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  configuracionOAuth, estaDisponible, fichaDeProveedor, nombreDeProveedor, obtenerProveedor, redirectUri, urlDeLaApp, type ConfigOAuth, type Env, type Proveedor,
} from "./proveedores.ts";
import { desafioS256, firmarEstado, nuevoVerificador, secretoDeEstado, verificarEstado, VIDA_DEL_ESTADO_MS } from "./estado.ts";

if (typeof window !== "undefined") throw new Error("src/lib/integraciones/servicio.ts es solo para el servidor.");

export class ConexionError extends Error {
  readonly status: number;
  readonly codigo: string;
  constructor(status: number, codigo: string, mensaje: string) {
    super(mensaje);
    this.status = status;
    this.codigo = codigo;
  }
}

export type DepsConexiones = {
  db: SupabaseClient;
  env: Env;
  fetch: typeof fetch;
  ahora: () => Date;
  /** Solo recibe mensajes con códigos y ids: ningún token, código de autorización ni cuerpo de respuesta. */
  log: Pick<Console, "info" | "warn" | "error">;
};

/** Renovar si faltan menos de 5 minutos. */
export const MARGEN_RENOVACION_MS = 5 * 60 * 1000;
const CANDADO_RENOVACION_S = 30;
const TIMEOUT_PROVEEDOR_MS = 10_000;

const buscarProveedor = (id: string): Proveedor => {
  const p = /^[a-z0-9_]{2,40}$/.test(id) ? obtenerProveedor(id) : undefined;
  if (!p) throw new ConexionError(404, "proveedor_desconocido", "No existe esa aplicación.");
  return p;
};

// ── Intercambio con el proveedor ──────────────────────────────────────────────────────────────────────────────────────
const RespuestaToken = z.object({
  access_token: z.string().min(1).max(8000),
  refresh_token: z.string().min(1).max(8000).optional(),
  expires_in: z.number().int().positive().max(60 * 60 * 24 * 365).optional(),
  token_type: z.string().max(40).optional(),
  scope: z.string().max(2000).optional(),
  account_label: z.string().max(200).optional(),
});
type TokenDelProveedor = z.infer<typeof RespuestaToken>;

/** `rechazado` = el proveedor dijo que no (código o refresh inválido): no sirve reintentar. `temporal` = red o 5xx. */
class ErrorDeToken extends Error {
  readonly tipo: "rechazado" | "temporal";
  constructor(tipo: "rechazado" | "temporal") {
    super(tipo === "rechazado" ? "El proveedor rechazó la petición." : "El proveedor no respondió bien.");
    this.tipo = tipo;
  }
}

async function pedirToken(d: DepsConexiones, cfg: ConfigOAuth, params: Record<string, string>): Promise<TokenDelProveedor> {
  const cuerpo = new URLSearchParams({ ...params, client_id: cfg.clientId, ...(cfg.clientSecret ? { client_secret: cfg.clientSecret } : {}) });
  let res: Response;
  try {
    res = await d.fetch(cfg.urlToken, {
      method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" }, body: cuerpo, redirect: "error",
      signal: AbortSignal.timeout(TIMEOUT_PROVEEDOR_MS),
    });
  } catch {
    throw new ErrorDeToken("temporal");
  }
  if (res.status >= 500) throw new ErrorDeToken("temporal");
  if (!res.ok) throw new ErrorDeToken("rechazado");
  let json: unknown;
  try { json = await res.json(); } catch { throw new ErrorDeToken("temporal"); }
  const v = RespuestaToken.safeParse(json);
  if (!v.success) throw new ErrorDeToken("temporal");
  return v.data;
}

/** El secreto guardado en Vault: un JSON con versión. */
type Secreto = { v: 1; access_token?: string; refresh_token?: string; token_type?: string; api_key?: string };
const aSecreto = (s: Secreto) => JSON.stringify(s);
const caducaEn = (t: TokenDelProveedor, ahora: Date) => (t.expires_in ? new Date(ahora.getTime() + t.expires_in * 1000).toISOString() : null);

// ── 1) Iniciar ────────────────────────────────────────────────────────────────────────────────────────────────────────
export async function iniciarConexion(d: DepsConexiones, e: { companyId: string; userId: string; proveedorId: string }): Promise<{ url: string }> {
  const p = buscarProveedor(e.proveedorId);
  const secreto = secretoDeEstado(d.env);
  if (!secreto) throw new ConexionError(503, "conexiones_sin_configurar", "Las conexiones no están configuradas en el servidor (falta CONEXIONES_STATE_SECRET).");
  const app = urlDeLaApp(d.env);
  if (!app) throw new ConexionError(503, "conexiones_sin_configurar", "Falta APP_URL en el servidor.");
  if (p.tipoAuth !== "oauth2") throw new ConexionError(400, "no_es_oauth", `${p.nombre} no se conecta con autorización: usa su clave.`);
  const cfg = configuracionOAuth(p, d.env);
  if (!cfg || !estaDisponible(p, d.env)) throw new ConexionError(409, "proveedor_no_disponible", `${p.nombre} todavía no está disponible.`);

  const nonce = randomUUID();
  const verificador = p.pkce ? nuevoVerificador() : null;
  const ahora = d.ahora();
  const caduca = ahora.getTime() + VIDA_DEL_ESTADO_MS;
  const { error } = await d.db.from("oauth_states").insert({
    nonce, company_id: e.companyId, user_id: e.userId, proveedor: p.id, code_verifier: verificador, expira_en: new Date(caduca).toISOString(),
  });
  if (error) throw new ConexionError(500, "error_interno", "No se pudo iniciar la conexión.");
  // Limpieza de estados viejos (caducados hace más de un día).
  void d.db.from("oauth_states").delete().lt("expira_en", new Date(ahora.getTime() - 24 * 3600 * 1000).toISOString()).then(() => {}, () => {});

  const state = firmarEstado({ n: nonce, c: e.companyId, u: e.userId, p: p.id, e: caduca }, secreto);
  const u = new URL(cfg.urlAutorizacion);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("client_id", cfg.clientId);
  u.searchParams.set("redirect_uri", redirectUri(p.id, app));
  if (p.scopes.length) u.searchParams.set("scope", p.scopes.join(" "));
  u.searchParams.set("state", state);
  if (verificador) {
    u.searchParams.set("code_challenge", desafioS256(verificador));
    u.searchParams.set("code_challenge_method", "S256");
  }
  return { url: u.href };
}

// ── 2) Callback ─────────────────────────────────────────────────────────────────────────────────────────────────────
/** Valida el state y lo CONSUME (un solo uso). Devuelve el verificador PKCE guardado en el servidor. */
async function validarYConsumirEstado(d: DepsConexiones, e: { companyId: string; userId: string; proveedorId: string; state: string }): Promise<{ verificador: string | null }> {
  const secreto = secretoDeEstado(d.env);
  if (!secreto) throw new ConexionError(503, "conexiones_sin_configurar", "Las conexiones no están configuradas en el servidor.");
  const v = verificarEstado(e.state, secreto, d.ahora().getTime());
  if (!v.ok) throw new ConexionError(400, "estado_invalido", v.motivo === "caducado" ? "El enlace de conexión ha caducado. Vuelve a empezar." : "El estado de la conexión no es válido.");
  const c = v.carga;
  if (c.p !== e.proveedorId) throw new ConexionError(400, "estado_invalido", "El estado de la conexión no es válido.");
  // Otra empresa u otra persona que la que empezó el flujo: se rechaza (y no se consume el estado de quien sí lo empezó).
  if (c.c !== e.companyId || c.u !== e.userId) throw new ConexionError(403, "estado_de_otra_sesion", "Esta conexión la inició otra sesión.");
  const { data, error } = await d.db.rpc("conexion_consumir_estado", { p_nonce: c.n, p_company_id: e.companyId, p_user_id: e.userId, p_proveedor: e.proveedorId });
  if (error) throw new ConexionError(500, "error_interno", "No se pudo completar la conexión.");
  const fila = (data as { code_verifier: string | null }[] | null)?.[0];
  if (!fila) throw new ConexionError(400, "estado_invalido", "El enlace de conexión ya se usó o ha caducado. Vuelve a empezar.");
  return { verificador: fila.code_verifier };
}

/** El proveedor devolvió `?error=...` (p. ej. la persona pulsó «Cancelar»): se valida y consume el state y se informa. */
export async function rechazarConexion(d: DepsConexiones, e: { companyId: string; userId: string; proveedorId: string; state: string }): Promise<void> {
  buscarProveedor(e.proveedorId);
  await validarYConsumirEstado(d, e);
}

export async function completarConexion(d: DepsConexiones, e: { companyId: string; userId: string; proveedorId: string; state: string; code: string }): Promise<{ conexionId: string }> {
  const p = buscarProveedor(e.proveedorId);
  const cfg = configuracionOAuth(p, d.env);
  const app = urlDeLaApp(d.env);
  if (!cfg || !app) throw new ConexionError(409, "proveedor_no_disponible", `${p.nombre} todavía no está disponible.`);
  if (!e.code || e.code.length > 2000) throw new ConexionError(400, "codigo_invalido", "Falta el código de autorización.");
  const { verificador } = await validarYConsumirEstado(d, e);

  let t: TokenDelProveedor;
  try {
    t = await pedirToken(d, cfg, {
      grant_type: "authorization_code", code: e.code, redirect_uri: redirectUri(p.id, app), ...(verificador ? { code_verifier: verificador } : {}),
    });
  } catch (err) {
    d.log.warn(`[conexiones] ${p.id}: el intercambio del código falló (${err instanceof ErrorDeToken ? err.tipo : "error"}) para la empresa ${e.companyId}.`);
    throw new ConexionError(502, "intercambio_fallido", `${p.nombre} no aceptó la conexión. Inténtalo de nuevo.`);
  }
  const ahora = d.ahora();
  const scopes = t.scope ? t.scope.split(/[\s,]+/).filter(Boolean) : p.scopes;
  const { data, error } = await d.db.rpc("conexion_guardar", {
    p_company_id: e.companyId, p_user_id: e.userId, p_proveedor: p.id, p_tipo_auth: p.tipoAuth, p_cuenta: t.account_label ?? null,
    p_scopes: scopes, p_caduca: caducaEn(t, ahora),
    p_secreto: aSecreto({ v: 1, access_token: t.access_token, ...(t.refresh_token ? { refresh_token: t.refresh_token } : {}), token_type: t.token_type ?? "Bearer" }),
  });
  if (error || !data) {
    d.log.error(`[conexiones] ${p.id}: no se pudo guardar la conexión de la empresa ${e.companyId}.`);
    throw new ConexionError(500, "error_interno", "No se pudo guardar la conexión.");
  }
  d.log.info(`[conexiones] ${p.id}: conectado para la empresa ${e.companyId} (conexión ${data}).`);
  return { conexionId: data as string };
}

/** Proveedores con clave de API (p. ej. WhatsApp): la clave se guarda cifrada igual que un token. */
export async function conectarConClave(d: DepsConexiones, e: { companyId: string; userId: string; proveedorId: string; clave: string; cuenta?: string }): Promise<{ conexionId: string }> {
  const p = buscarProveedor(e.proveedorId);
  if (p.tipoAuth !== "api_key") throw new ConexionError(400, "no_es_clave", `${p.nombre} no se conecta con una clave.`);
  const { data, error } = await d.db.rpc("conexion_guardar", {
    p_company_id: e.companyId, p_user_id: e.userId, p_proveedor: p.id, p_tipo_auth: p.tipoAuth, p_cuenta: e.cuenta ?? null, p_scopes: [], p_caduca: null,
    p_secreto: aSecreto({ v: 1, api_key: e.clave }),
  });
  if (error || !data) throw new ConexionError(500, "error_interno", "No se pudo guardar la conexión.");
  d.log.info(`[conexiones] ${p.id}: conectado con clave para la empresa ${e.companyId}.`);
  return { conexionId: data as string };
}

// ── 3) Credenciales (solo servidor) ───────────────────────────────────────────────────────────────────────────────────
export type Credenciales = {
  conexionId: string;
  tipo: "oauth2" | "api_key";
  /** Token de acceso o clave de API. NUNCA a la IA, a las respuestas ni a los registros. */
  token: string;
  tokenType: string;
  caducaEn: Date | null;
  cuentaExterna: string | null;
  scopes: string[];
};

type FilaConexion = { id: string; estado: string; caduca_en: string | null; cuenta_externa: string | null; scopes: string[] | null; tipo_auth: string | null };
const COLS_CONEXION = "id, estado, caduca_en, cuenta_externa, scopes, tipo_auth";

async function filaConectada(d: DepsConexiones, companyId: string, proveedorId: string): Promise<FilaConexion | null> {
  const { data, error } = await d.db.from("company_connections").select(COLS_CONEXION).eq("company_id", companyId).eq("proveedor", proveedorId).eq("estado", "conectado").maybeSingle();
  if (error) throw new ConexionError(500, "error_interno", "No se pudo leer la conexión.");
  return (data as FilaConexion | null) ?? null;
}

async function leerSecreto(d: DepsConexiones, companyId: string, conexionId: string): Promise<Secreto | null> {
  const { data, error } = await d.db.rpc("leer_token_conexion", { p_company_id: companyId, p_connection_id: conexionId });
  if (error || typeof data !== "string") return null;
  try { return JSON.parse(data) as Secreto; } catch { return null; }
}

type Renovacion = "renovada" | "caducada" | "pendiente" | "no_hace_falta" | "ocupada";

/** Renueva el token de una conexión si caduca pronto. Si el proveedor la rechaza (o ya caducó y no se puede), pasa a «caducado» y avisa a la empresa. */
export async function renovarSiHaceFalta(d: DepsConexiones, companyId: string, c: FilaConexion, proveedorId: string, forzar = false): Promise<Renovacion> {
  const ahora = d.ahora().getTime();
  const caduca = c.caduca_en ? Date.parse(c.caduca_en) : null;
  if (!forzar && (caduca === null || caduca - ahora > MARGEN_RENOVACION_MS)) return "no_hace_falta";
  const p = buscarProveedor(proveedorId);
  const yaCaducado = caduca !== null && caduca <= ahora;
  const marcarCaducada = async (motivo: string) => {
    await d.db.rpc("conexion_marcar_caducada", { p_company_id: companyId, p_connection_id: c.id, p_nombre: p.nombre, p_motivo: motivo });
    d.log.warn(`[conexiones] ${p.id}: conexión ${c.id} de la empresa ${companyId} pasa a «caducado» (${motivo}).`);
    return "caducada" as const;
  };

  const secreto = await leerSecreto(d, companyId, c.id);
  if (!secreto?.refresh_token) return yaCaducado ? marcarCaducada("el token caducó y no hay forma de renovarlo") : "no_hace_falta";
  const cfg = configuracionOAuth(p, d.env);
  if (!cfg) return yaCaducado ? marcarCaducada("el proveedor ya no está configurado") : "pendiente";

  const { data: lock } = await d.db.rpc("conexion_reclamar_renovacion", { p_company_id: companyId, p_connection_id: c.id, p_segundos: CANDADO_RENOVACION_S });
  if (lock !== true) return "ocupada"; // otro proceso la está renovando

  try {
    const t = await pedirToken(d, cfg, { grant_type: "refresh_token", refresh_token: secreto.refresh_token });
    const { error } = await d.db.rpc("conexion_actualizar_token", {
      p_company_id: companyId, p_connection_id: c.id, p_caduca: caducaEn(t, d.ahora()),
      p_secreto: aSecreto({ v: 1, access_token: t.access_token, refresh_token: t.refresh_token ?? secreto.refresh_token, token_type: t.token_type ?? secreto.token_type ?? "Bearer" }),
    });
    if (error) throw new ErrorDeToken("temporal");
    d.log.info(`[conexiones] ${p.id}: token de la conexión ${c.id} renovado.`);
    return "renovada";
  } catch (err) {
    const tipo = err instanceof ErrorDeToken ? err.tipo : "temporal";
    if (tipo === "rechazado") return marcarCaducada("el proveedor rechazó la renovación");
    d.log.warn(`[conexiones] ${p.id}: no se pudo renovar la conexión ${c.id} (error temporal).`);
    if (yaCaducado) return marcarCaducada("el token caducó y la renovación falló");
    return "pendiente";
  }
}

/**
 * Credenciales de la empresa para un proveedor, SOLO para el servidor (las usa el ejecutor de herramientas).
 * Renueva el token si caduca en menos de 5 minutos. Devuelve null si no hay conexión activa (o la renovación falló y pasó a «caducado»).
 */
export async function obtenerCredenciales(d: DepsConexiones, companyId: string, proveedorId: string): Promise<Credenciales | null> {
  let c = await filaConectada(d, companyId, proveedorId);
  if (!c) return null;
  const r = await renovarSiHaceFalta(d, companyId, c, proveedorId);
  if (r === "caducada") return null;
  if (r === "renovada" || r === "ocupada") {
    // Si la renueva otro proceso, se espera un momento a que termine y se vuelve a leer.
    for (let i = 0; i < (r === "ocupada" ? 10 : 1); i++) {
      if (r === "ocupada") await new Promise((ok) => setTimeout(ok, 300));
      c = await filaConectada(d, companyId, proveedorId);
      if (!c) return null;
      if (c.caduca_en === null || Date.parse(c.caduca_en) - d.ahora().getTime() > MARGEN_RENOVACION_MS) break;
    }
  }
  if (!c) return null;
  const s = await leerSecreto(d, companyId, c.id);
  const token = s?.access_token ?? s?.api_key;
  if (!s || !token) return null;
  if (c.caduca_en && Date.parse(c.caduca_en) <= d.ahora().getTime()) return null;
  return {
    conexionId: c.id, tipo: s.api_key ? "api_key" : "oauth2", token, tokenType: s.token_type ?? "Bearer",
    caducaEn: c.caduca_en ? new Date(c.caduca_en) : null, cuentaExterna: c.cuenta_externa, scopes: c.scopes ?? [],
  };
}

/** Adaptador para el `GestorSecretos` del ejecutor de herramientas: devuelve solo el token. */
export const lectorDeSecretos = (d: DepsConexiones) => async (companyId: string, proveedorId: string): Promise<string | null> =>
  (await obtenerCredenciales(d, companyId, proveedorId))?.token ?? null;

// ── 4) Desconectar ────────────────────────────────────────────────────────────────────────────────────────────────────
export async function desconectar(d: DepsConexiones, e: { companyId: string; conexionId: string }): Promise<{ desconectada: true; revocada: boolean | null }> {
  const { data, error } = await d.db.from("company_connections").select("id, proveedor, estado").eq("company_id", e.companyId).eq("id", e.conexionId).maybeSingle();
  if (error) throw new ConexionError(500, "error_interno", "No se pudo leer la conexión.");
  if (!data) throw new ConexionError(404, "conexion_no_encontrada", "No existe esa conexión en vuestra oficina.");
  const p = obtenerProveedor(data.proveedor as string);
  let revocada: boolean | null = null;
  // Revocar en el proveedor (RFC 7009) si lo permite. Es un intento: si falla, el secreto se borra igualmente.
  const cfg = p ? configuracionOAuth(p, d.env) : null;
  if (p && cfg?.urlRevocar && data.estado === "conectado") {
    const s = await leerSecreto(d, e.companyId, e.conexionId);
    const tokens = [s?.refresh_token && { token: s.refresh_token, hint: "refresh_token" }, s?.access_token && { token: s.access_token, hint: "access_token" }].filter(Boolean) as { token: string; hint: string }[];
    revocada = tokens.length > 0;
    for (const t of tokens) {
      try {
        const res = await d.fetch(cfg.urlRevocar, {
          method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, redirect: "error", signal: AbortSignal.timeout(TIMEOUT_PROVEEDOR_MS),
          body: new URLSearchParams({ token: t.token, token_type_hint: t.hint, client_id: cfg.clientId, ...(cfg.clientSecret ? { client_secret: cfg.clientSecret } : {}) }),
        });
        if (!res.ok) revocada = false;
      } catch { revocada = false; }
    }
    if (revocada === false) d.log.warn(`[conexiones] ${p.id}: no se pudo revocar el token de la conexión ${e.conexionId}; se borra igualmente.`);
  }
  const { data: ok, error: e2 } = await d.db.rpc("conexion_desconectar", { p_company_id: e.companyId, p_connection_id: e.conexionId });
  if (e2 || ok !== true) throw new ConexionError(500, "error_interno", "No se pudo desconectar.");
  d.log.info(`[conexiones] ${data.proveedor}: desconectado (conexión ${e.conexionId}, empresa ${e.companyId}).`);
  return { desconectada: true, revocada };
}

// ── 5) Lo que ve la empresa ───────────────────────────────────────────────────────────────────────────────────────────
export type ConexionPublica = { id: string; estado: string; cuentaExterna: string | null; scopes: string[]; caducaEn: string | null; conectadoEn: string; ultimoError: string | null };

export async function listarConexiones(d: DepsConexiones, companyId: string) {
  const { data, error } = await d.db.from("company_connections").select("id, proveedor, estado, cuenta_externa, scopes, caduca_en, conectado_en, ultimo_error").eq("company_id", companyId);
  if (error) throw new ConexionError(500, "error_interno", "No se pudieron leer las conexiones.");
  const por = new Map((data ?? []).map((c) => [c.proveedor as string, c]));
  const { PROVEEDORES } = await import("./proveedores.ts");
  return PROVEEDORES.map((p) => {
    const c = por.get(p.id);
    const conexion: ConexionPublica | null = c
      ? { id: c.id as string, estado: c.estado as string, cuentaExterna: (c.cuenta_externa as string | null) ?? null, scopes: (c.scopes as string[]) ?? [], caducaEn: (c.caduca_en as string | null) ?? null, conectadoEn: c.conectado_en as string, ultimoError: (c.ultimo_error as string | null) ?? null }
      : null;
    return { ...fichaDeProveedor(p, d.env), conexion };
  });
}

export { nombreDeProveedor };
