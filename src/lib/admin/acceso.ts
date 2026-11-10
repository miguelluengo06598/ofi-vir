/**
 * Acceso al panel interno de IDESIE (/admin/*). SOLO SERVIDOR.
 *
 * Solo entra quien tiene el rol `admin_idesie` en public.users. Cualquier otro caso (sin sesión, token falso, propietario o
 * administrador de una empresa cliente) recibe lo mismo: «no existe» (404), para no revelar que el panel está ahí.
 * Sin cabecera Authorization y fuera de producción se usa la persona de desarrollo DEV_ADMIN_USER_ID (mientras no haya login).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export const ROL_ADMIN_IDESIE = "admin_idesie";
export type SesionAdmin = { userId: string };

async function esAdmin(db: SupabaseClient, userId: string): Promise<boolean> {
  const { data } = await db.from("users").select("role").eq("id", userId).maybeSingle();
  return (data as { role: string } | null)?.role === ROL_ADMIN_IDESIE;
}

export async function sesionAdminIdesie(
  headers: Pick<Headers, "get">, db: SupabaseClient, env: Record<string, string | undefined> = process.env,
): Promise<SesionAdmin | null> {
  const cabecera = headers.get("authorization");
  if (cabecera !== null) {
    const token = /^Bearer (.+)$/.exec(cabecera)?.[1];
    if (!token) return null;
    const { data, error } = await db.auth.getUser(token);
    return !error && data.user && (await esAdmin(db, data.user.id)) ? { userId: data.user.id } : null;
  }
  if (env.NODE_ENV === "production") return null;
  const dev = env.DEV_ADMIN_USER_ID?.trim();
  return dev && (await esAdmin(db, dev)) ? { userId: dev } : null;
}
