/**
 * Cliente mínimo de la Graph API de Meta. SOLO SERVIDOR.
 *  - El token viaja en la cabecera Authorization, nunca en la URL (las URLs acaban en registros).
 *  - Cada llamada lleva `appsecret_proof` (HMAC-SHA256 del token con el secreto de la app): Meta rechaza un token
 *    robado que se use desde fuera de nuestro servidor si la app lo exige.
 *  - Los errores salen como `ErrorDeMeta` con un tipo y los códigos numéricos de Meta: nunca el mensaje ni el cuerpo
 *    de la respuesta (pueden llevar datos de la cuenta).
 */
import { createHmac } from "node:crypto";
import { urlGraphDeMeta, type Env } from "../proveedores.ts";

export type DepsGraph = { fetch: typeof fetch; env: Env };
export type TipoErrorMeta = "token" | "permiso" | "limite" | "temporal" | "sin_configurar" | "otro";

export class ErrorDeMeta extends Error {
  readonly tipo: TipoErrorMeta;
  readonly codigo: number | null;
  readonly subcodigo: number | null;
  constructor(tipo: TipoErrorMeta, codigo: number | null = null, subcodigo: number | null = null) {
    super(`Meta: ${tipo}${codigo === null ? "" : ` (${codigo}${subcodigo === null ? "" : `/${subcodigo}`})`}`);
    this.tipo = tipo;
    this.codigo = codigo;
    this.subcodigo = subcodigo;
  }
}

const TIMEOUT_MS = 10_000;

/** Clasifica un error de la Graph API por su código (https://developers.facebook.com/docs/graph-api/guides/error-handling). */
export function clasificarError(status: number, error: { code?: unknown; error_subcode?: unknown } | undefined): ErrorDeMeta {
  const codigo = typeof error?.code === "number" ? error.code : null;
  const sub = typeof error?.error_subcode === "number" ? error.error_subcode : null;
  if (codigo === 190 || codigo === 102) return new ErrorDeMeta("token", codigo, sub); // token caducado, revocado o inválido
  if (codigo === 10 || codigo === 3 || (codigo !== null && codigo >= 200 && codigo <= 299)) return new ErrorDeMeta("permiso", codigo, sub);
  if (codigo === 4 || codigo === 17 || codigo === 32 || codigo === 613 || status === 429) return new ErrorDeMeta("limite", codigo, sub);
  if (status >= 500 || codigo === 1 || codigo === 2) return new ErrorDeMeta("temporal", codigo, sub);
  return new ErrorDeMeta("otro", codigo, sub);
}

export const pruebaDeSecreto = (token: string, appSecret: string) => createHmac("sha256", appSecret).update(token).digest("hex");

type Opciones = { token: string; metodo?: "GET" | "POST" | "DELETE"; params?: Record<string, string> };

/** Llama a `<graph>/<ruta>` con el token indicado y devuelve el JSON. `ruta` sin barra inicial (p. ej. `me/accounts`). */
export async function graph<T>(d: DepsGraph, ruta: string, o: Opciones): Promise<T> {
  const base = urlGraphDeMeta(d.env);
  const secreto = d.env.META_APP_SECRET?.trim();
  if (!base || !secreto) throw new ErrorDeMeta("sin_configurar");
  if (!/^[A-Za-z0-9_/]{1,120}$/.test(ruta)) throw new ErrorDeMeta("otro"); // la ruta la construye el servidor con ids ya validados
  const metodo = o.metodo ?? "GET";
  const params = new URLSearchParams({ ...(o.params ?? {}), appsecret_proof: pruebaDeSecreto(o.token, secreto) });
  const url = metodo === "GET" || metodo === "DELETE" ? `${base}/${ruta}?${params}` : `${base}/${ruta}`;
  let res: Response;
  try {
    res = await d.fetch(url, {
      method: metodo, redirect: "error", signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { authorization: `Bearer ${o.token}`, accept: "application/json", ...(metodo === "POST" ? { "content-type": "application/x-www-form-urlencoded" } : {}) },
      ...(metodo === "POST" ? { body: params } : {}),
    });
  } catch {
    throw new ErrorDeMeta("temporal");
  }
  let cuerpo: unknown;
  try { cuerpo = await res.json(); } catch { cuerpo = null; }
  if (!res.ok || (cuerpo && typeof cuerpo === "object" && "error" in cuerpo)) {
    throw clasificarError(res.status, (cuerpo as { error?: { code?: unknown; error_subcode?: unknown } } | null)?.error);
  }
  return cuerpo as T;
}

/** Recorre una lista paginada con cursores (nunca con `paging.next`, que trae el token en la URL). Tope de páginas. */
export async function graphLista<T>(d: DepsGraph, ruta: string, o: Opciones, maxPaginas = 10): Promise<T[]> {
  const todo: T[] = [];
  let despues: string | undefined;
  for (let i = 0; i < maxPaginas; i++) {
    const r = await graph<{ data?: T[]; paging?: { cursors?: { after?: string }; next?: string } }>(d, ruta, {
      ...o, params: { limit: "100", ...(o.params ?? {}), ...(despues ? { after: despues } : {}) },
    });
    todo.push(...(r.data ?? []));
    despues = r.paging?.next ? r.paging.cursors?.after : undefined;
    if (!despues) break;
  }
  return todo;
}

/**
 * Cambia el token de usuario recién obtenido (dura horas) por uno de larga duración (~60 días). Los tokens de
 * página que se piden con él no caducan. Es el único sitio donde el secreto de la app va como parámetro.
 */
export async function tokenDeLargaDuracion(d: DepsGraph, tokenCorto: string): Promise<string> {
  const base = urlGraphDeMeta(d.env);
  const appId = d.env.META_APP_ID?.trim(), secreto = d.env.META_APP_SECRET?.trim();
  if (!base || !appId || !secreto) throw new ErrorDeMeta("sin_configurar");
  let res: Response;
  try {
    res = await d.fetch(`${base}/oauth/access_token`, {
      method: "POST", redirect: "error", signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body: new URLSearchParams({ grant_type: "fb_exchange_token", client_id: appId, client_secret: secreto, fb_exchange_token: tokenCorto }),
    });
  } catch {
    throw new ErrorDeMeta("temporal");
  }
  let cuerpo: { access_token?: unknown; error?: { code?: unknown; error_subcode?: unknown } } | null;
  try { cuerpo = await res.json(); } catch { cuerpo = null; }
  if (!res.ok || !cuerpo || typeof cuerpo.access_token !== "string" || cuerpo.access_token.length < 20) throw clasificarError(res.status, cuerpo?.error);
  return cuerpo.access_token;
}
