/**
 * Acceso al panel de certificación (/admin/certificacion). SOLO SERVIDOR.
 *
 * Solo entra quien está en `public.reviewers` como activo, con rol `revisor_samgple` o `admin_samgple`. Cualquier otro caso (sin sesión,
 * token falso, propietario o administrador de una empresa cliente) recibe lo mismo: «no existe» (404).
 * Fuera de producción y sin cabecera Authorization se usa una persona de desarrollo (mientras no haya login): la cookie `dev_revisor`
 * (para cambiar de revisor y probar la segunda opinión), DEV_REVISOR_USER_ID o DEV_ADMIN_USER_ID; siempre que esté en `reviewers`.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export const ROLES_REVISOR = ["revisor_samgple", "admin_samgple"] as const;
export type RolRevisor = (typeof ROLES_REVISOR)[number];
export type SesionRevisor = { userId: string; rol: RolRevisor; nombre: string; categorias: string[]; esDeDesarrollo: boolean };
export const COOKIE_DEV_REVISOR = "dev_revisor";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function revisor(db: SupabaseClient, userId: string, esDeDesarrollo: boolean): Promise<SesionRevisor | null> {
  if (!UUID.test(userId)) return null;
  const { data } = await db.from("reviewers").select("user_id, rol, nombre, categorias, activo").eq("user_id", userId).maybeSingle();
  if (!data || data.activo !== true || !(ROLES_REVISOR as readonly string[]).includes(data.rol as string)) return null;
  return { userId, rol: data.rol as RolRevisor, nombre: (data.nombre as string | null) ?? "Revisor", categorias: (data.categorias as string[] | null) ?? [], esDeDesarrollo };
}

export async function sesionRevisor(
  headers: Pick<Headers, "get">, db: SupabaseClient, env: Record<string, string | undefined> = process.env,
): Promise<SesionRevisor | null> {
  const cabecera = headers.get("authorization");
  if (cabecera !== null) {
    const token = /^Bearer (.+)$/.exec(cabecera)?.[1];
    if (!token) return null;
    const { data, error } = await db.auth.getUser(token);
    return !error && data.user ? revisor(db, data.user.id, false) : null;
  }
  if (env.NODE_ENV === "production") return null;
  const cookie = new RegExp(`(?:^|;\\s*)${COOKIE_DEV_REVISOR}=([0-9a-fA-F-]{36})`).exec(headers.get("cookie") ?? "")?.[1];
  for (const id of [cookie, env.DEV_REVISOR_USER_ID?.trim(), env.DEV_ADMIN_USER_ID?.trim()]) {
    const s = id ? await revisor(db, id, true) : null;
    if (s) return s;
  }
  return null;
}

/** Los revisores activos (para el selector de persona de desarrollo y para mostrar nombres). */
export async function listarRevisores(db: SupabaseClient): Promise<{ userId: string; nombre: string; rol: string; categorias: string[] }[]> {
  const { data } = await db.from("reviewers").select("user_id, nombre, rol, categorias").eq("activo", true).order("nombre");
  return (data ?? []).map((r) => ({ userId: r.user_id as string, nombre: (r.nombre as string | null) ?? "Revisor", rol: r.rol as string, categorias: (r.categorias as string[] | null) ?? [] }));
}
