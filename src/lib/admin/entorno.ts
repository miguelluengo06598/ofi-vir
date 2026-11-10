import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/** Cliente con clave de servicio para el panel interno. Solo servidor. */
export function dbAdminDesdeEntorno(env: Record<string, string | undefined> = process.env): SupabaseClient | null {
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? createClient(url, key, { auth: { persistSession: false } }) : null;
}
