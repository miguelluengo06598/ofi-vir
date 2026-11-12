/**
 * Rutas /api/conexiones. SOLO SERVIDOR. Las rutas de Next.js son un envoltorio fino sobre estos manejadores.
 *  - La empresa y la persona salen SIEMPRE de la sesión, nunca de la URL ni del cuerpo.
 *  - Conectar y desconectar: solo propietarios y administradores. Ver el estado: cualquier miembro.
 *  - Ninguna respuesta ni redirección lleva un token, un código de autorización ni el id del secreto.
 */
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { autenticadorSupabase, type Sesion } from "../creditos/api.ts";
import { integracionesFaltantes } from "./faltantes.ts";
import { urlDeLaApp } from "./proveedores.ts";
import { completarConexion, conectarConClave, ConexionError, desconectar, iniciarConexion, listarConexiones, rechazarConexion, type DepsConexiones } from "./servicio.ts";
import { esGestor } from "../empresas/permisos.ts";
import { completarConexionMeta, limpiarEnMetaAntesDeDesconectar, PROVEEDOR_META } from "./meta/servicio.ts";

export type DepsApiConexiones = { deps: DepsConexiones; autenticar: (req: Request) => Promise<Sesion | null> };

const json = (cuerpo: unknown, status = 200) => Response.json(cuerpo, { status, headers: { "cache-control": "no-store" } });
const fallo = (status: number, error: string, mensaje: string) => json({ error, mensaje }, status);
const redirigir = (url: string) => new Response(null, { status: 302, headers: { location: url, "cache-control": "no-store" } });
const idValido = (id: string) => z.uuid().safeParse(id).success;

async function entrar(req: Request, api: DepsApiConexiones, gestion: boolean): Promise<{ res: Response } | { sesion: Sesion }> {
  const sesion = await api.autenticar(req);
  if (!sesion) return { res: fallo(401, "no_autenticado", "Inicia sesión para continuar.") };
  if (gestion && !esGestor(sesion.rol)) return { res: fallo(403, "sin_permiso", "Solo los propietarios y administradores pueden conectar aplicaciones.") };
  return { sesion };
}

function responderError(e: unknown, api: DepsApiConexiones): Response {
  if (e instanceof ConexionError) return fallo(e.status, e.codigo, e.message);
  // Solo el tipo del error: nunca su contenido (podría arrastrar datos del proveedor).
  api.deps.log.error(`[conexiones] error inesperado (${e instanceof Error ? e.name : "desconocido"})`);
  return fallo(500, "error_interno", "No se pudo completar la operación.");
}

/** A dónde vuelve la persona tras conectar: la pantalla de conexiones, con el resultado en la URL (sin datos sensibles). */
function destinoFinal(api: DepsApiConexiones, resultado: string, proveedor: string): string {
  const base = urlDeLaApp(api.deps.env) ?? "";
  return `${base}/conexiones?resultado=${encodeURIComponent(resultado)}&proveedor=${encodeURIComponent(proveedor)}`;
}

/** GET /api/conexiones — catálogo de aplicaciones con su estado de conexión en esta empresa. */
export async function listarHandler(req: Request, api: DepsApiConexiones): Promise<Response> {
  const e = await entrar(req, api, false);
  if ("res" in e) return e.res;
  try {
    return json({ proveedores: await listarConexiones(api.deps, e.sesion.companyId) });
  } catch (err) {
    return responderError(err, api);
  }
}

/** GET /api/conexiones/[proveedor]/iniciar — redirige a la pantalla de autorización del proveedor (con `Accept: application/json`, devuelve `{ url }`). */
export async function iniciarHandler(req: Request, proveedorId: string, api: DepsApiConexiones): Promise<Response> {
  const e = await entrar(req, api, true);
  if ("res" in e) return e.res;
  try {
    const { url } = await iniciarConexion(api.deps, { companyId: e.sesion.companyId, userId: e.sesion.userId, proveedorId });
    return /application\/json/.test(req.headers.get("accept") ?? "") ? json({ url }) : redirigir(url);
  } catch (err) {
    return responderError(err, api);
  }
}

/**
 * GET /api/conexiones/[proveedor]/callback?code&state — valida el state, canjea el código, guarda los tokens cifrados y crea/actualiza la conexión.
 * Un state manipulado, caducado, reutilizado o de otra sesión se rechaza con un error (400/403), no con una redirección.
 */
export async function callbackHandler(req: Request, proveedorId: string, api: DepsApiConexiones): Promise<Response> {
  const e = await entrar(req, api, true);
  if ("res" in e) return e.res;
  const q = new URL(req.url).searchParams;
  const state = q.get("state") ?? "";
  try {
    const base = { companyId: e.sesion.companyId, userId: e.sesion.userId, proveedorId, state };
    if (q.get("error")) {
      await rechazarConexion(api.deps, base);
      return redirigir(destinoFinal(api, q.get("error") === "access_denied" ? "cancelado" : "error", proveedorId));
    }
    if (proveedorId === PROVEEDOR_META) {
      // Facebook: además del token, se guardan las páginas y se comprueba qué permisos se dieron de verdad.
      const r = await completarConexionMeta(api.deps, { companyId: e.sesion.companyId, userId: e.sesion.userId, state, code: q.get("code") ?? "" });
      const app = urlDeLaApp(api.deps.env) ?? "";
      return redirigir(`${app}/conexiones/facebook?resultado=${r.resultado}${r.enOtraOficina ? "&en_revision=1" : ""}`);
    }
    await completarConexion(api.deps, { ...base, code: q.get("code") ?? "" });
    return redirigir(destinoFinal(api, "ok", proveedorId));
  } catch (err) {
    if (err instanceof ConexionError && err.codigo === "intercambio_fallido") return redirigir(destinoFinal(api, "error", proveedorId));
    return responderError(err, api);
  }
}

const ClaveSchema = z.strictObject({ clave: z.string().trim().min(8).max(500), cuenta: z.string().trim().max(200).optional() });

/** POST /api/conexiones/[proveedor]/clave — conecta un proveedor de tipo `api_key`. */
export async function claveHandler(req: Request, proveedorId: string, api: DepsApiConexiones): Promise<Response> {
  const e = await entrar(req, api, true);
  if ("res" in e) return e.res;
  let cuerpo: unknown;
  try { cuerpo = JSON.parse((await req.text()) || "{}"); } catch { return fallo(400, "json_invalido", "El cuerpo no es un JSON válido."); }
  const v = ClaveSchema.safeParse(cuerpo);
  if (!v.success) return fallo(400, "peticion_invalida", "La petición no es válida.");
  try {
    const r = await conectarConClave(api.deps, { companyId: e.sesion.companyId, userId: e.sesion.userId, proveedorId, clave: v.data.clave, cuenta: v.data.cuenta });
    return json({ conexionId: r.conexionId });
  } catch (err) {
    return responderError(err, api);
  }
}

/** POST /api/conexiones/[id]/desconectar — revoca el token si el proveedor lo permite y borra el secreto. */
export async function desconectarHandler(req: Request, id: string, api: DepsApiConexiones): Promise<Response> {
  const e = await entrar(req, api, true);
  if ("res" in e) return e.res;
  if (!idValido(id)) return fallo(404, "conexion_no_encontrada", "No existe esa conexión en vuestra oficina.");
  try {
    // Facebook: antes de borrar los accesos, se deja de recibir avisos y se retiran los permisos en Meta (mejor esfuerzo).
    const { data: con } = await api.deps.db.from("company_connections").select("proveedor, estado").eq("company_id", e.sesion.companyId).eq("id", id).maybeSingle();
    if (con?.proveedor === PROVEEDOR_META && con.estado === "conectado") await limpiarEnMetaAntesDeDesconectar(api.deps, e.sesion.companyId);
    return json(await desconectar(api.deps, { companyId: e.sesion.companyId, conexionId: id }));
  } catch (err) {
    return responderError(err, api);
  }
}

/** GET /api/agentes/[id]/integraciones — «Falta conectar X»: lo que el agente necesita y no está conectado. */
export async function faltantesHandler(req: Request, agentId: string, api: DepsApiConexiones): Promise<Response> {
  const e = await entrar(req, api, false);
  if ("res" in e) return e.res;
  if (!idValido(agentId)) return fallo(404, "agente_no_encontrado", "No existe ese agente en vuestra oficina.");
  try {
    const faltan = await integracionesFaltantes(api.deps.db, e.sesion.companyId, agentId);
    return faltan ? json({ faltan }) : fallo(404, "agente_no_encontrado", "No existe ese agente en vuestra oficina.");
  } catch (err) {
    return responderError(err, api);
  }
}

/** Dependencias a partir del entorno. null si falta la base. */
export function depsConexionesDesdeEntorno(env: Record<string, string | undefined> = process.env): DepsApiConexiones | null {
  const url = env.NEXT_PUBLIC_SUPABASE_URL, key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  const db = createClient(url, key, { auth: { persistSession: false } });
  return { autenticar: autenticadorSupabase(db, env), deps: { db, env, fetch, ahora: () => new Date(), log: console } };
}
