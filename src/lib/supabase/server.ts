import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

/** Cliente ligado a las cookies de App Router. Nunca usar la service role aquí. */
export async function supabaseServidor() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Falta la configuración pública de Supabase.");
  const almacen = await cookies();
  return createServerClient(url, key, {
    cookies: {
      getAll: () => almacen.getAll(),
      // Un Server Component no puede escribir cookies. El proxy refresca la sesión antes de renderizar;
      // las Server Actions y los Route Handlers sí pueden escribir mediante su propio cliente.
      setAll: (items) => {
        try { items.forEach(({ name, value, options }) => almacen.set(name, value, options)); } catch { /* renderizado */ }
      },
    },
  });
}

/** Lectura administrativa, exclusivamente en código de servidor. */
export function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Falta la configuración de servidor de Supabase.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function usuarioActual() {
  const supabase = await supabaseServidor();
  const { data, error } = await supabase.auth.getUser();
  return error ? null : data.user;
}
