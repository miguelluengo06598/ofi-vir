/**
 * Acceso al panel de certificación (/admin/certificacion). SOLO SERVIDOR.
 *
 * Solo entra quien está en `public.reviewers` como activo, con rol `revisor_samgple` o `admin_samgple`. Cualquier otro caso (sin sesión,
 * token falso, propietario o administrador de una empresa cliente) recibe lo mismo: «no existe» (404).
 * No hay persona de desarrollo ni atajos: siempre es la sesión real, con MFA verificada (`exigirRolPlataforma`).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { exigirRolPlataforma } from "../acceso.ts";

export const ROLES_REVISOR = ["revisor_samgple", "admin_samgple"] as const;
export type RolRevisor = (typeof ROLES_REVISOR)[number];
export type SesionRevisor = { userId: string; rol: RolRevisor; nombre: string; categorias: string[]; esDeDesarrollo: boolean };

export async function sesionRevisor(
  headers: Pick<Headers, "get">, db: SupabaseClient, _env: Record<string, string | undefined> = process.env,
): Promise<SesionRevisor | null> {
  void _env;
  const plataforma = await exigirRolPlataforma(ROLES_REVISOR, headers, db);
  if (!plataforma) return null;
  return {
    userId: plataforma.userId,
    rol: plataforma.roles.includes("admin_samgple") ? "admin_samgple" : "revisor_samgple",
    nombre: plataforma.nombre,
    categorias: plataforma.categorias,
    esDeDesarrollo: false,
  };
}

/** Los revisores activos (para el selector de persona de desarrollo y para mostrar nombres). */
export async function listarRevisores(db: SupabaseClient): Promise<{ userId: string; nombre: string; rol: string; categorias: string[] }[]> {
  const { data } = await db.from("reviewers").select("user_id, nombre, rol, categorias").eq("activo", true).order("nombre");
  return (data ?? []).map((r) => ({ userId: r.user_id as string, nombre: (r.nombre as string | null) ?? "Revisor", rol: r.rol as string, categorias: (r.categorias as string[] | null) ?? [] }));
}
