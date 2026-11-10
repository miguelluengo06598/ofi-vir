/**
 * Rutas del ciclo de vida de un agente. SOLO SERVIDOR; las rutas de Next.js son un envoltorio fino sobre estos manejadores.
 *
 *   GET  /api/agentes/[id]/ciclo                          estado, lo que falta para certificar, solicitud en curso, plantilla nueva
 *   POST /api/agentes/[id]/estado                         { accion: 'activar' | 'pausar' | 'archivar' }
 *   POST /api/agentes/[id]/certificacion/cancelar         cancela la solicitud en curso
 *   GET  /api/agentes/[id]/versiones                      historial con diferencias y certificaciones
 *   POST /api/agentes/[id]/versiones                      { cambios, motivo?, versionEsperada? } → versión nueva (y a certificación si ya trabaja)
 *   POST /api/agentes/[id]/versiones/[version]/restaurar  «Volver a esta versión»
 *   POST /api/agentes/[id]/plantilla/actualizar           versión nueva con la plantilla nueva (vía rápida)
 *   GET  /api/agentes/[id]/correcciones                   correcciones activas y pendientes
 *   POST /api/agentes/[id]/correcciones/proponer          { contexto, original, corregida } → regla propuesta por Claude Haiku (no guarda)
 *   POST /api/agentes/[id]/correcciones                   { contexto, original, corregida, regla } → guarda («Recordar para la próxima»)
 *   DELETE /api/agentes/[id]/correcciones/[correccionId]  retira una corrección
 *
 * La empresa sale SIEMPRE de la sesión; cuerpos con zod estricto (un `companyId` enviado se rechaza); un agente de otra empresa es 404.
 * Leer y enseñar correcciones: cualquier miembro. Cambiar la configuración, el estado o retirar correcciones: propietarios y administradores.
 */
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { AnthropicLlm } from "../../agents/anthropicClient.ts";
import type { LlmClient } from "../../agents/llm.ts";
import { depsExamenDesdeEntorno } from "../../certificacion/entorno.ts";
import { ejecutarExamen } from "../../certificacion/examen.ts";
import { autenticadorSupabase, type Sesion } from "../../creditos/api.ts";
import { guardarCorreccion, listarCorrecciones, MAX_REGLA, proponerRegla, retirarCorreccion } from "../correcciones/servicio.ts";
import { esGestor } from "../../empresas/permisos.ts";
import {
  actualizarPlantilla, cambiarEstado, CambiosSchema, cancelarSolicitud, cicloDelAgente, CicloError, guardarVersion, listarVersiones, restaurarVersion, type DepsCiclo,
} from "./servicio.ts";

export type DepsApiCiclo = {
  deps: DepsCiclo;
  autenticar: (req: Request) => Promise<Sesion | null>;
  /** Para proponer la regla de una corrección. Sin él, `proponer` responde 503 y la empresa escribe la regla a mano. */
  llm?: LlmClient | null;
};

const json = (cuerpo: unknown, status = 200) => Response.json(cuerpo, { status, headers: { "cache-control": "no-store" } });
const fallo = (status: number, error: string, mensaje: string, extra: Record<string, unknown> = {}) => json({ error, mensaje, ...extra }, status);
const incidencias = (e: z.ZodError) => e.issues.map((i) => ({ campo: i.path.join(".") || null, mensaje: i.message }));
const NO_EXISTE = () => fallo(404, "agente_no_encontrado", "No existe ese agente en vuestra oficina.");

type Entrada = { res: Response } | { sesion: Sesion; cuerpo: unknown };
async function entrar(req: Request, api: DepsApiCiclo, idAgente: string, o: { soloAdmin: boolean; conCuerpo?: boolean }): Promise<Entrada> {
  const sesion = await api.autenticar(req);
  if (!sesion) return { res: fallo(401, "no_autenticado", "Inicia sesión para continuar.") };
  if (o.soloAdmin && !esGestor(sesion.rol)) return { res: fallo(403, "sin_permiso", "Solo los propietarios y administradores pueden cambiar un agente.") };
  if (!z.uuid().safeParse(idAgente).success) return { res: NO_EXISTE() };
  if (!o.conCuerpo) return { sesion, cuerpo: null };
  let cuerpo: unknown;
  try { cuerpo = JSON.parse((await req.text()) || "{}"); } catch { return { res: fallo(400, "json_invalido", "El cuerpo no es un JSON válido.") }; }
  return { sesion, cuerpo };
}

function responderError(e: unknown): Response {
  if (e instanceof CicloError) return fallo(e.status, e.codigo, e.message, e.extra);
  console.error("Error en el ciclo de vida del agente", e instanceof Error ? e.message : "desconocido");
  return fallo(500, "error_interno", "No se pudo completar la operación.");
}

const ids = (s: Sesion, idAgente: string) => ({ companyId: s.companyId, agentId: idAgente, userId: s.userId });

// ── Estado ───────────────────────────────────────────────────────────────────────────────────────────
export async function cicloHandler(req: Request, idAgente: string, api: DepsApiCiclo): Promise<Response> {
  const e = await entrar(req, api, idAgente, { soloAdmin: false });
  if ("res" in e) return e.res;
  try { return json(await cicloDelAgente(api.deps.db, e.sesion.companyId, idAgente)); } catch (err) { return responderError(err); }
}

const EstadoSchema = z.object({ accion: z.enum(["activar", "pausar", "archivar"]) }).strict();
export async function estadoHandler(req: Request, idAgente: string, api: DepsApiCiclo): Promise<Response> {
  const e = await entrar(req, api, idAgente, { soloAdmin: true, conCuerpo: true });
  if ("res" in e) return e.res;
  const v = EstadoSchema.safeParse(e.cuerpo);
  if (!v.success) return fallo(400, "peticion_invalida", "La petición no es válida.", { incidencias: incidencias(v.error) });
  try { return json({ estado: await cambiarEstado(api.deps.db, { companyId: e.sesion.companyId, agentId: idAgente, accion: v.data.accion }) }); } catch (err) { return responderError(err); }
}

export async function cancelarHandler(req: Request, idAgente: string, api: DepsApiCiclo): Promise<Response> {
  const e = await entrar(req, api, idAgente, { soloAdmin: true });
  if ("res" in e) return e.res;
  try { await cancelarSolicitud(api.deps.db, { companyId: e.sesion.companyId, agentId: idAgente }); return json({ cancelada: true }); } catch (err) { return responderError(err); }
}

// ── Versiones ────────────────────────────────────────────────────────────────────────────────────────
export async function versionesHandler(req: Request, idAgente: string, api: DepsApiCiclo): Promise<Response> {
  const e = await entrar(req, api, idAgente, { soloAdmin: false });
  if ("res" in e) return e.res;
  try { return json(await listarVersiones(api.deps.db, e.sesion.companyId, idAgente)); } catch (err) { return responderError(err); }
}

const GuardarSchema = z.object({ cambios: CambiosSchema, motivo: z.string().trim().min(1).max(300).optional(), versionEsperada: z.number().int().min(1).optional() }).strict();
export async function guardarVersionHandler(req: Request, idAgente: string, api: DepsApiCiclo): Promise<Response> {
  const e = await entrar(req, api, idAgente, { soloAdmin: true, conCuerpo: true });
  if ("res" in e) return e.res;
  const v = GuardarSchema.safeParse(e.cuerpo);
  if (!v.success) return fallo(400, "peticion_invalida", "La petición no es válida.", { incidencias: incidencias(v.error) });
  try { return json(await guardarVersion(api.deps, { ...ids(e.sesion, idAgente), ...v.data }), 201); } catch (err) { return responderError(err); }
}

export async function restaurarHandler(req: Request, idAgente: string, version: string, api: DepsApiCiclo): Promise<Response> {
  const e = await entrar(req, api, idAgente, { soloAdmin: true });
  if ("res" in e) return e.res;
  const n = z.coerce.number().int().min(1).max(1_000_000).safeParse(version);
  if (!n.success) return fallo(404, "no_encontrado", "No existe esa versión del agente.");
  try { return json(await restaurarVersion(api.deps, { ...ids(e.sesion, idAgente), version: n.data }), 201); } catch (err) { return responderError(err); }
}

export async function actualizarPlantillaHandler(req: Request, idAgente: string, api: DepsApiCiclo): Promise<Response> {
  const e = await entrar(req, api, idAgente, { soloAdmin: true });
  if ("res" in e) return e.res;
  try { return json(await actualizarPlantilla(api.deps, ids(e.sesion, idAgente)), 201); } catch (err) { return responderError(err); }
}

// ── Correcciones ─────────────────────────────────────────────────────────────────────────────────────
const textoLargo = z.string().trim().min(1).max(8000);
const ProponerSchema = z.object({ contexto: z.string().trim().max(4000).default(""), original: textoLargo, corregida: textoLargo }).strict();
const CorreccionSchema = z.object({ contexto: z.string().trim().max(4000).default(""), original: textoLargo, corregida: textoLargo, regla: z.string().trim().min(3).max(MAX_REGLA) }).strict();

export async function correccionesHandler(req: Request, idAgente: string, api: DepsApiCiclo): Promise<Response> {
  const e = await entrar(req, api, idAgente, { soloAdmin: false });
  if ("res" in e) return e.res;
  try {
    await cicloDelAgente(api.deps.db, e.sesion.companyId, idAgente);   // 404 si el agente no es de la empresa
    return json(await listarCorrecciones(api.deps.db, e.sesion.companyId, idAgente));
  } catch (err) { return responderError(err); }
}

export async function proponerCorreccionHandler(req: Request, idAgente: string, api: DepsApiCiclo): Promise<Response> {
  const e = await entrar(req, api, idAgente, { soloAdmin: false, conCuerpo: true });
  if ("res" in e) return e.res;
  const v = ProponerSchema.safeParse(e.cuerpo);
  if (!v.success) return fallo(400, "peticion_invalida", "La petición no es válida.", { incidencias: incidencias(v.error) });
  if (v.data.original === v.data.corregida) return fallo(400, "sin_cambios", "La respuesta corregida es igual que la original.");
  if (!api.llm) return fallo(503, "sin_modelo", "No hay modelo configurado para resumir la corrección: escribe tú la regla.");
  try {
    const { data } = await api.deps.db.from("agents").select("id").eq("company_id", e.sesion.companyId).eq("id", idAgente).maybeSingle();
    if (!data) return NO_EXISTE();
    return json({ regla: (await proponerRegla(api.llm, v.data)).regla });
  } catch (err) {
    if (err instanceof CicloError) return responderError(err);
    console.error("Error al proponer la regla de una corrección", err instanceof Error ? err.message : "desconocido");
    return fallo(502, "sin_propuesta", "No se pudo resumir la corrección. Escribe tú la regla.");
  }
}

export async function guardarCorreccionHandler(req: Request, idAgente: string, api: DepsApiCiclo): Promise<Response> {
  const e = await entrar(req, api, idAgente, { soloAdmin: false, conCuerpo: true });
  if ("res" in e) return e.res;
  const v = CorreccionSchema.safeParse(e.cuerpo);
  if (!v.success) return fallo(400, "peticion_invalida", "La petición no es válida.", { incidencias: incidencias(v.error) });
  try { return json(await guardarCorreccion(api.deps, { ...ids(e.sesion, idAgente), ...v.data }), 201); } catch (err) { return responderError(err); }
}

export async function retirarCorreccionHandler(req: Request, idAgente: string, correccionId: string, api: DepsApiCiclo): Promise<Response> {
  const e = await entrar(req, api, idAgente, { soloAdmin: true });
  if ("res" in e) return e.res;
  if (!z.uuid().safeParse(correccionId).success) return fallo(404, "no_encontrado", "No existe esa corrección.");
  try { return json(await retirarCorreccion(api.deps, { ...ids(e.sesion, idAgente), correccionId })); } catch (err) { return responderError(err); }
}

// ── Entorno ──────────────────────────────────────────────────────────────────────────────────────────
/**
 * Dependencias a partir del entorno. null si falta la base. Con `enSegundoPlano` (en Next, `after`) el examen técnico se lanza al momento;
 * sin él, la solicitud queda `pendiente_examen` y la recoge la tarea periódica `examenes-certificacion`.
 */
export function depsCicloDesdeEntorno(enSegundoPlano?: (p: Promise<unknown>) => void, env: Record<string, string | undefined> = process.env): DepsApiCiclo | null {
  const url = env.NEXT_PUBLIC_SUPABASE_URL, key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  const db = createClient(url, key, { auth: { persistSession: false } });
  const lanzarExamen = enSegundoPlano
    ? (companyId: string, requestId: string) => {
        const examen = depsExamenDesdeEntorno(env);
        if (!examen) return;
        enSegundoPlano(ejecutarExamen(examen, { companyId, requestId }).catch((e) => console.error("Error en el examen de certificación", requestId, e instanceof Error ? e.message : "desconocido")));
      }
    : undefined;
  return { deps: { db, lanzarExamen }, autenticar: autenticadorSupabase(db, env), llm: AnthropicLlm.fromEnv() };
}
