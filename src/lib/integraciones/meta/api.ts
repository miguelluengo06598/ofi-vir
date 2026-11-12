/**
 * Rutas /api/conexiones/meta. SOLO SERVIDOR. Envoltorios finos sobre `servicio.ts`.
 *  - La empresa y la persona salen SIEMPRE de la sesión. Cambiar algo: solo propietarios y administradores.
 *  - Ninguna respuesta lleva un token ni el id de un secreto.
 */
import { z } from "zod";
import { esGestor } from "../../empresas/permisos.ts";
import type { DepsApiConexiones } from "../api.ts";
import { ConexionError } from "../servicio.ts";
import {
  abrirPrueba, actualizarFormularios, AjustesFormulario, AjustesPagina, dejarDeRecibirLeadsDe, estadoMeta, guardarFormulario, guardarPagina, leadsRecibidos, recibirLeadsDe,
} from "./servicio.ts";

const json = (cuerpo: unknown, status = 200) => Response.json(cuerpo, { status, headers: { "cache-control": "no-store" } });
const fallo = (status: number, error: string, mensaje: string) => json({ error, mensaje }, status);

async function ejecutar(req: Request, api: DepsApiConexiones, gestion: boolean, fn: (companyId: string) => Promise<unknown>): Promise<Response> {
  const sesion = await api.autenticar(req);
  if (!sesion) return fallo(401, "no_autenticado", "Inicia sesión para continuar.");
  if (gestion && !esGestor(sesion.rol)) return fallo(403, "sin_permiso", "Solo los propietarios y administradores pueden cambiar las conexiones.");
  try {
    return json((await fn(sesion.companyId)) ?? { ok: true });
  } catch (e) {
    if (e instanceof ConexionError) return fallo(e.status, e.codigo, e.message);
    api.deps.log.error(`[meta] error inesperado (${e instanceof Error ? e.name : "desconocido"})`);
    return fallo(500, "error_interno", "No se pudo completar la operación.");
  }
}
async function cuerpo<T extends z.ZodType>(req: Request, esquema: T): Promise<z.infer<T>> {
  let datos: unknown;
  try { datos = JSON.parse((await req.text()) || "{}"); } catch { throw new ConexionError(400, "json_invalido", "El cuerpo no es un JSON válido."); }
  const v = esquema.safeParse(datos);
  if (!v.success) throw new ConexionError(400, "peticion_invalida", "La petición no es válida.");
  return v.data;
}

/** GET /api/conexiones/meta — páginas, formularios, agentes y avisos (cualquier miembro). */
export const estadoHandler = (req: Request, api: DepsApiConexiones) => ejecutar(req, api, false, (c) => estadoMeta(api.deps, c));

const CambioPagina = z.union([z.strictObject({ recibir: z.boolean() }), z.strictObject({ actualizarFormularios: z.literal(true) }), AjustesPagina]);
/** POST /api/conexiones/meta/paginas/[id] — marcar o desmarcar la página, traer sus formularios o cambiar sus ajustes. */
export const paginaHandler = (req: Request, id: string, api: DepsApiConexiones) =>
  ejecutar(req, api, true, async (c) => {
    const v = await cuerpo(req, CambioPagina);
    if ("recibir" in v) await (v.recibir ? recibirLeadsDe(api.deps, c, id) : dejarDeRecibirLeadsDe(api.deps, c, id));
    else if ("actualizarFormularios" in v) await actualizarFormularios(api.deps, c, id);
    else await guardarPagina(api.deps, c, id, v);
    return estadoMeta(api.deps, c);
  });

/** POST /api/conexiones/meta/formularios/[id] — recibir o no sus leads y qué agente los atiende. */
export const formularioHandler = (req: Request, id: string, api: DepsApiConexiones) =>
  ejecutar(req, api, true, async (c) => {
    await guardarFormulario(api.deps, c, id, await cuerpo(req, AjustesFormulario));
    return estadoMeta(api.deps, c);
  });

/** POST /api/conexiones/meta/paginas/[id]/prueba — abre la ventana de prueba. GET ?desde= — lo que ha llegado desde entonces. */
export const abrirPruebaHandler = (req: Request, id: string, api: DepsApiConexiones) => ejecutar(req, api, true, (c) => abrirPrueba(api.deps, c, id));
export const leadsDePruebaHandler = (req: Request, id: string, api: DepsApiConexiones) =>
  ejecutar(req, api, false, async (c) => ({ leads: await leadsRecibidos(api.deps, c, id, new URL(req.url).searchParams.get("desde") ?? "") }));
