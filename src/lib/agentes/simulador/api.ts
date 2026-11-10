/**
 * POST /api/agentes/[id]/simular y /simular/casos. SOLO SERVIDOR; las rutas de Next.js son un envoltorio fino.
 *  - La empresa sale SIEMPRE de la sesión; cuerpos con zod estricto (un `companyId` enviado se rechaza).
 *  - Solo propietarios y administradores (simular gasta cuota o créditos). Un agente de otra empresa responde 404.
 */
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { motorDesdeEntorno } from "../../agents/fromEnv.ts";
import { autenticadorSupabase, type Sesion } from "../../creditos/api.ts";
import { crearServicioCreditos } from "../../creditos/servicio.ts";
import { leerConfigSimulador } from "../../creditos/tarifas.ts";
import { SupabaseFuenteInstrucciones } from "../fuenteInstrucciones.ts";
import { SupabaseAlmacenSimulador } from "./almacen.ts";
import { PeticionCasosSchema, PeticionSimularSchema } from "./esquemas.ts";
import { probarCasosDePlantilla, SimuladorError, simularAgente, type DepsSimulador } from "./servicio.ts";

export type DepsApiSimulador = { deps: DepsSimulador; autenticar: (req: Request) => Promise<Sesion | null> };

const json = (cuerpo: unknown, status = 200) => Response.json(cuerpo, { status, headers: { "cache-control": "no-store" } });
const fallo = (status: number, error: string, mensaje: string, extra: Record<string, unknown> = {}) => json({ error, mensaje, ...extra }, status);

async function entrar(req: Request, api: DepsApiSimulador, idAgente: string): Promise<{ res: Response } | { sesion: Sesion; cuerpo: unknown }> {
  const sesion = await api.autenticar(req);
  if (!sesion) return { res: fallo(401, "no_autenticado", "Inicia sesión para continuar.") };
  if (sesion.rol !== "owner" && sesion.rol !== "admin") return { res: fallo(403, "sin_permiso", "Solo los propietarios y administradores pueden probar agentes.") };
  if (!z.uuid().safeParse(idAgente).success) return { res: fallo(404, "agente_no_encontrado", "No existe ese agente en vuestra oficina.") };
  let cuerpo: unknown;
  try { cuerpo = JSON.parse((await req.text()) || "{}"); } catch { return { res: fallo(400, "json_invalido", "El cuerpo no es un JSON válido.") }; }
  return { sesion, cuerpo };
}
const incidencias = (e: z.ZodError) => e.issues.map((i) => ({ campo: i.path.join(".") || null, mensaje: i.message }));

function responderError(e: unknown): Response {
  if (e instanceof SimuladorError) return fallo(e.status, e.codigo, e.message);
  console.error("Error en el simulador de agentes", e instanceof Error ? e.message : "desconocido");
  return fallo(500, "error_interno", "No se pudo completar la simulación.");
}

export async function simularHandler(req: Request, idAgente: string, api: DepsApiSimulador): Promise<Response> {
  const entrada = await entrar(req, api, idAgente);
  if ("res" in entrada) return entrada.res;
  const v = PeticionSimularSchema.safeParse(entrada.cuerpo);
  if (!v.success) return fallo(400, "peticion_invalida", "La petición no es válida.", { incidencias: incidencias(v.error) });
  try {
    return json(await simularAgente(api.deps, { companyId: entrada.sesion.companyId, agentId: idAgente, ...v.data }));
  } catch (e) {
    return responderError(e);
  }
}

export async function casosHandler(req: Request, idAgente: string, api: DepsApiSimulador): Promise<Response> {
  const entrada = await entrar(req, api, idAgente);
  if ("res" in entrada) return entrada.res;
  const v = PeticionCasosSchema.safeParse(entrada.cuerpo);
  if (!v.success) return fallo(400, "peticion_invalida", "La petición no es válida.", { incidencias: incidencias(v.error) });
  try {
    return json(await probarCasosDePlantilla(api.deps, { companyId: entrada.sesion.companyId, agentId: idAgente, casos: v.data.casos }));
  } catch (e) {
    return responderError(e);
  }
}

/** Dependencias a partir del entorno. null si falta la base o la clave de Claude (la ruta responde 503). */
export function depsSimuladorDesdeEntorno(env: Record<string, string | undefined> = process.env): DepsApiSimulador | null {
  const url = env.NEXT_PUBLIC_SUPABASE_URL, key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  const motor = motorDesdeEntorno();
  if (!motor || !motor.deps.catalogo) return null;
  const db = createClient(url, key, { auth: { persistSession: false } });
  return {
    autenticar: autenticadorSupabase(db, env),
    deps: {
      // El simulador monta las instrucciones con el constructor (plantilla protegida + ficha + reglas), como las verá el agente certificado.
      engine: { ...motor.deps, catalogo: motor.deps.catalogo, instrucciones: new SupabaseFuenteInstrucciones(db) },
      almacen: new SupabaseAlmacenSimulador(db),
      creditos: crearServicioCreditos({ db }),
      config: leerConfigSimulador(env),
      // La primera simulación pasa el agente de «borrador» a «en pruebas» (requisito para enviarlo a certificación).
      alSimular: async (companyId, agentId) => { await db.rpc("agente_cambiar_estado", { p_company_id: companyId, p_agent_id: agentId, p_accion: "probar" }); },
    },
  };
}
