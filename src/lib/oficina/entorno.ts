/** Dependencias de las rutas de control de la oficina a partir del entorno. Solo servidor. */
import { createClient } from "@supabase/supabase-js";
import { autenticadorSupabase } from "../creditos/api.ts";
import type { DepsOficina } from "./api.ts";

export function depsOficinaDesdeEntorno(env: Record<string, string | undefined> = process.env): DepsOficina | null {
  const url = env.NEXT_PUBLIC_SUPABASE_URL, key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  const db = createClient(url, key, { auth: { persistSession: false } });
  return { db, autenticar: autenticadorSupabase(db, env) };
}
