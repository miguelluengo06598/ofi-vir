/**
 * Rutas /api/agentes/[id]/asistente y /asistente/aplicar. SOLO SERVIDOR. Las rutas de Next.js son un envoltorio fino sobre
 * estos manejadores, que reciben sus dependencias por parámetro.
 *  - La empresa sale SIEMPRE de la sesión; los cuerpos se validan con zod en modo estricto (un `companyId` enviado se rechaza).
 *  - Solo propietarios y administradores: configurar un agente cambia su comportamiento y cuesta créditos.
 *  - Un agente de otra empresa responde 404, igual que uno que no existe.
 */
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { AnthropicLlm } from "../../agents/anthropicClient.ts";
import { autenticadorSupabase, type Sesion } from "../../creditos/api.ts";
import { CreditosError, crearServicioCreditos } from "../../creditos/servicio.ts";
import { PeticionAplicarSchema, PeticionAsistenteSchema } from "./esquemas.ts";
import { certificarCambiosPendientes, type EnvioCertificacion } from "../versiones/servicio.ts";
import { aplicarPropuesta, AsistenteError, turnoAsistente, type DepsAsistente } from "./servicio.ts";
import { SupabaseAlmacenAsistente } from "./supabaseAlmacen.ts";
import { esGestor } from "../../empresas/permisos.ts";

export type DepsApiAsistente = {
  deps: DepsAsistente;
  autenticar: (req: Request) => Promise<Sesion | null>;
  /**
   * Tras aplicar una propuesta: si el agente ya trabaja, la versión nueva NO se ha aplicado a su configuración (sigue la certificada)
   * y aquí se envía a certificación. Devuelve qué pasó con el envío (null si el agente aún no trabajaba).
   */
  trasAplicar?: (e: { companyId: string; agentId: string; userId: string }) => Promise<EnvioCertificacion | null>;
};

const json = (cuerpo: unknown, status = 200) => Response.json(cuerpo, { status, headers: { "cache-control": "no-store" } });
const fallo = (status: number, error: string, mensaje: string, extra: Record<string, unknown> = {}) => json({ error, mensaje, ...extra }, status);

async function leerJson(req: Request): Promise<{ ok: true; datos: unknown } | { ok: false; res: Response }> {
  try {
    return { ok: true, datos: JSON.parse((await req.text()) || "{}") };
  } catch {
    return { ok: false, res: fallo(400, "json_invalido", "El cuerpo no es un JSON válido.") };
  }
}

async function entrar(req: Request, api: DepsApiAsistente, idAgente: string): Promise<{ res: Response } | { sesion: Sesion }> {
  const sesion = await api.autenticar(req);
  if (!sesion) return { res: fallo(401, "no_autenticado", "Inicia sesión para continuar.") };
  if (!esGestor(sesion.rol)) return { res: fallo(403, "sin_permiso", "Solo los propietarios y administradores pueden configurar agentes.") };
  if (!z.uuid().safeParse(idAgente).success) return { res: fallo(404, "agente_no_encontrado", "No existe ese agente en vuestra oficina.") };
  return { sesion };
}

function responderError(e: unknown): Response {
  if (e instanceof AsistenteError) return fallo(e.status, e.codigo, e.message, e.extra);
  if (e instanceof CreditosError) {
    if (e.codigo === "sin_saldo" || e.codigo === "tope_mensual") return fallo(402, e.codigo, e.message);
    if (e.codigo === "oficina_pausada") return fallo(403, e.codigo, e.message);
  }
  console.error("Error en el asistente de configuración", e instanceof Error ? e.message : e);
  return fallo(500, "error_interno", "No se pudo completar la operación.");
}

/** POST /api/agentes/[id]/asistente — { mensaje, sesionId? } → propuesta (no guarda nada en el agente). */
export async function asistenteHandler(req: Request, idAgente: string, api: DepsApiAsistente): Promise<Response> {
  const entrada = await entrar(req, api, idAgente);
  if ("res" in entrada) return entrada.res;
  const cuerpo = await leerJson(req);
  if (!cuerpo.ok) return cuerpo.res;
  const v = PeticionAsistenteSchema.safeParse(cuerpo.datos);
  if (!v.success) return fallo(400, "peticion_invalida", "La petición no es válida.", { incidencias: v.error.issues.map((i) => ({ campo: i.path.join(".") || null, mensaje: i.message })) });
  try {
    const r = await turnoAsistente(api.deps, { companyId: entrada.sesion.companyId, userId: entrada.sesion.userId, agentId: idAgente, mensaje: v.data.mensaje, sesionId: v.data.sesionId });
    return json(r);
  } catch (e) {
    return responderError(e);
  }
}

/** POST /api/agentes/[id]/asistente/aplicar — { sesionId, campos? } → aplica la propuesta y crea la versión nueva. */
export async function aplicarHandler(req: Request, idAgente: string, api: DepsApiAsistente): Promise<Response> {
  const entrada = await entrar(req, api, idAgente);
  if ("res" in entrada) return entrada.res;
  const cuerpo = await leerJson(req);
  if (!cuerpo.ok) return cuerpo.res;
  const v = PeticionAplicarSchema.safeParse(cuerpo.datos);
  if (!v.success) return fallo(400, "peticion_invalida", "La petición no es válida.", { incidencias: v.error.issues.map((i) => ({ campo: i.path.join(".") || null, mensaje: i.message })) });
  try {
    const r = await aplicarPropuesta(api.deps, { companyId: entrada.sesion.companyId, userId: entrada.sesion.userId, agentId: idAgente, sesionId: v.data.sesionId, campos: v.data.campos });
    const certificacion = api.trasAplicar ? await api.trasAplicar({ companyId: entrada.sesion.companyId, agentId: idAgente, userId: entrada.sesion.userId }) : null;
    return json({ ...r, certificacion });
  } catch (e) {
    return responderError(e);
  }
}

/** Dependencias a partir del entorno. null si falta la base; `llm` ausente → 503 al pedir una propuesta. */
export function depsAsistenteDesdeEntorno(env: Record<string, string | undefined> = process.env): DepsApiAsistente | null {
  const url = env.NEXT_PUBLIC_SUPABASE_URL, key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  const db = createClient(url, key, { auth: { persistSession: false } });
  const llm = AnthropicLlm.fromEnv();
  return {
    autenticar: autenticadorSupabase(db, env),
    trasAplicar: (e) => certificarCambiosPendientes({ db }, e),
    deps: {
      almacen: new SupabaseAlmacenAsistente(db),
      creditos: crearServicioCreditos({ db }),
      llm: llm ?? { create: async () => { throw new AsistenteError(503, "asistente_sin_configurar", "El asistente no está configurado (falta ANTHROPIC_API_KEY)."); } },
    },
  };
}
