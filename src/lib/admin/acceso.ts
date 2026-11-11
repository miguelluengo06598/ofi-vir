/**
 * Puerta única del panel interno de MyOfia. Los roles son acumulables y todo acceso requiere
 * una sesión Supabase elevada a AAL2 por una app de autenticación.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { cache } from "react";
import { tokenDeAcceso, verificarToken } from "../supabase/request.ts";

export const ROLES_PLATAFORMA = ["admin_samgple", "comercial_samgple", "implantacion_samgple", "revisor_samgple", "soporte_samgple", "finanzas_samgple"] as const;
export type RolPlataforma = (typeof ROLES_PLATAFORMA)[number];
export type SesionPlataforma = { userId: string; roles: RolPlataforma[]; nombre: string; categorias: string[]; mfaVerificada: boolean };
export type SesionAdmin = { userId: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const validos = new Set<string>(ROLES_PLATAFORMA);

/** Una comprobación por petición: layout, página y componentes comparten el resultado (fuera de un render, no memoriza). */
const porPeticion = cache(() => new Map<string, Promise<SesionPlataforma | null>>());

async function cargarSesion(token: string, db: SupabaseClient): Promise<SesionPlataforma | null> {
  const persona = await verificarToken(token);
  if (!persona || !UUID.test(persona.id)) return null;
  const { data } = await db.from("platform_roles").select("rol, roles, nombre, categorias, activo").eq("user_id", persona.id).maybeSingle();
  if (!data || data.activo !== true) return null;
  const roles = [...new Set([data.rol as string, ...((data.roles as string[] | null) ?? [])])].filter((rol): rol is RolPlataforma => validos.has(rol));
  if (roles.length === 0) return null;
  return { userId: persona.id, roles, nombre: (data.nombre as string | null) ?? "Equipo MyOfia", categorias: (data.categorias as string[] | null) ?? [], mfaVerificada: persona.aal === "aal2" };
}

/** Sesión de plataforma a partir de un token concreto, que se valida aquí (firma, caducidad y nivel MFA). */
export function sesionPlataformaDeToken(token: string | null, db: SupabaseClient): Promise<SesionPlataforma | null> {
  if (!token) return Promise.resolve(null);
  const memoria = porPeticion();
  let sesion = memoria.get(token);
  if (!sesion) memoria.set(token, (sesion = cargarSesion(token, db)));
  return sesion;
}

export function sesionPlataforma(headers: Pick<Headers, "get">, db: SupabaseClient): Promise<SesionPlataforma | null> {
  return sesionPlataformaDeToken(tokenDeAcceso(headers), db);
}

/** true si la sesión tiene alguno de esos roles (admin_samgple vale para todo). No comprueba la MFA. */
export const tieneRol = (sesion: Pick<SesionPlataforma, "roles">, roles: readonly RolPlataforma[]) =>
  sesion.roles.includes("admin_samgple") || roles.some((rol) => sesion.roles.includes(rol));

/** Exige al menos uno de los roles indicados y una MFA verificada en esta sesión. */
export async function exigirRolPlataforma(roles: readonly RolPlataforma[], headers: Pick<Headers, "get">, db: SupabaseClient): Promise<SesionPlataforma | null> {
  const sesion = await sesionPlataforma(headers, db);
  if (!sesion || !sesion.mfaVerificada) return null;
  return tieneRol(sesion, roles) ? sesion : null;
}

/** Compatibilidad de márgenes: administración o finanzas, siempre con MFA. */
export async function sesionAdminIdesie(headers: Pick<Headers, "get">, db: SupabaseClient, _env: Record<string, string | undefined> = process.env): Promise<SesionAdmin | null> {
  void _env;
  const sesion = await exigirRolPlataforma(["admin_samgple", "finanzas_samgple"], headers, db);
  return sesion ? { userId: sesion.userId } : null;
}

export async function registrarAuditoria(
  db: SupabaseClient,
  evento: { actorId: string; ip?: string | null; accion: string; companyId?: string | null; objetoTipo?: string | null; objetoId?: string | null; antes?: unknown; despues?: unknown; motivo?: string | null },
) {
  const { error } = await db.from("admin_audit_log").insert({
    actor_id: evento.actorId, ip: evento.ip ?? null, accion: evento.accion, company_id: evento.companyId ?? null,
    objeto_tipo: evento.objetoTipo ?? null, objeto_id: evento.objetoId ?? null, antes: evento.antes ?? null,
    despues: evento.despues ?? null, motivo: evento.motivo ?? null,
  });
  if (error) throw new Error("No se pudo registrar la auditoría administrativa.");
}

export function ipDe(headers: Pick<Headers, "get">): string | null {
  const ip = headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? headers.get("x-real-ip");
  return ip && /^[0-9a-f:.]+$/i.test(ip) ? ip : null;
}
