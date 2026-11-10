/** Dependencias del examen a partir del entorno. null si falta la base o la clave de Claude. Solo servidor. */
import { createClient } from "@supabase/supabase-js";
import { motorDesdeEntorno } from "../agents/fromEnv.ts";
import { SupabaseFuenteInstrucciones } from "../agentes/fuenteInstrucciones.ts";
import { SupabaseAlmacenSimulador } from "../agentes/simulador/almacen.ts";
import { crearServicioCreditos } from "../creditos/servicio.ts";
import { leerConfigSimulador } from "../creditos/tarifas.ts";
import type { DepsExamen } from "./examen.ts";

export function depsExamenDesdeEntorno(env: Record<string, string | undefined> = process.env): DepsExamen | null {
  const url = env.NEXT_PUBLIC_SUPABASE_URL, key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  const motor = motorDesdeEntorno();
  if (!motor || !motor.deps.catalogo) return null;
  const db = createClient(url, key, { auth: { persistSession: false } });
  return {
    db, memoria: motor.deps.memory, evaluador: motor.deps.llm, env,
    sim: {
      engine: { ...motor.deps, catalogo: motor.deps.catalogo, instrucciones: new SupabaseFuenteInstrucciones(db) },
      almacen: new SupabaseAlmacenSimulador(db), creditos: crearServicioCreditos({ db }), config: leerConfigSimulador(env),
    },
  };
}
