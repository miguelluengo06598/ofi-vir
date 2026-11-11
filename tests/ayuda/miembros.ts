/** Alta de una persona en una empresa para las pruebas: perfil (public.users) + pertenencia (company_members). */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { RolEmpresa } from "../../src/lib/empresas/permisos.ts";

const ROL: Record<string, RolEmpresa> = { owner: "propietario", admin: "admin", member: "miembro", propietario: "propietario", miembro: "miembro" };

/**
 * Una empresa tiene UN solo propietario (lo impone la base). Si la prueba pide otro «propietario» en una empresa que ya lo tiene
 * (p. ej. la del seed), se da de alta como admin: las pruebas antiguas solo necesitaban permisos de gestión.
 */
export async function altaEnEmpresa(db: SupabaseClient, p: { id: string; companyId: string; nombre: string; email: string; rol: string; puedeAprobar?: boolean }) {
  let rol = ROL[p.rol];
  if (!rol) throw new Error(`Rol de empresa desconocido: ${p.rol}`);
  if (rol === "propietario") {
    const { data } = await db.from("company_members").select("user_id").eq("company_id", p.companyId).eq("rol", "propietario").neq("estado", "desactivado").maybeSingle();
    if (data && data.user_id !== p.id) rol = "admin";
  }
  const u = await db.from("users").upsert({ id: p.id, full_name: p.nombre, email: p.email }, { onConflict: "id" });
  if (u.error) return u;
  return db.from("company_members").insert({ company_id: p.companyId, user_id: p.id, rol, puede_aprobar: p.puedeAprobar ?? false });
}

/** Rol de plataforma de MyOfia (no da acceso a ninguna empresa). */
export async function rolDePlataforma(db: SupabaseClient, p: { id: string; nombre: string; email: string; rol: "admin_samgple" | "revisor_samgple"; activo?: boolean }) {
  const u = await db.from("users").upsert({ id: p.id, full_name: p.nombre, email: p.email }, { onConflict: "id" });
  if (u.error) return u;
  return db.from("platform_roles").insert({ user_id: p.id, rol: p.rol, roles: [p.rol], nombre: p.nombre, categorias: ["ventas", "atencion"], activo: p.activo ?? true });
}
