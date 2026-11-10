/** Dependencias de las rutas /api/creditos/* a partir del entorno. Solo servidor. */
import { createClient } from "@supabase/supabase-js";
import { autenticadorSupabase, pagosSimuladosActivos, type DepsApi } from "./api.ts";
import { crearServicioCreditos } from "./servicio.ts";

export function depsApiDesdeEntorno(env: Record<string, string | undefined> = process.env): DepsApi | null {
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  const db = createClient(url, key, { auth: { persistSession: false } });
  return { db, servicio: crearServicioCreditos({ db }), autenticar: autenticadorSupabase(db, env), pagosSimulados: pagosSimuladosActivos(env) };
}
