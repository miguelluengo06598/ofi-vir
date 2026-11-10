/**
 * Cliente de Supabase para las pruebas contra la base LOCAL. La pasarela local (Kong) devuelve de vez en cuando un 502
 * («An invalid response was received from the upstream server») al reutilizar una conexión que PostgREST ya había cerrado: la petición
 * no llegó a ejecutarse, así que se repite. Solo para pruebas: en producción no hay que tapar un 502.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const fetchConReintento: typeof fetch = async (entrada, init) => {
  let res = await fetch(entrada, init);
  for (let intento = 0; res.status === 502 && intento < 3; intento++) {
    await new Promise((r) => setTimeout(r, 50 * (intento + 1)));
    res = await fetch(entrada, init);
  }
  return res;
};

export function clienteLocal(): { db: SupabaseClient; url: string; key: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "", key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";
  if (!url || !key) throw new Error("Faltan variables de Supabase: ejecuta la prueba con su script de npm (usa .env.local).");
  if (!/^https?:\/\/(127\.0\.0\.1|localhost)[:/]/.test(url)) throw new Error(`Solo contra la base LOCAL (${url} no lo es).`);
  return { db: createClient(url, key, { auth: { persistSession: false }, global: { fetch: fetchConReintento } }), url, key };
}
