/**
 * Puerta única del panel interno de MyOfia. Los roles son acumulables y todo acceso requiere
 * una sesión Supabase elevada a AAL2 por una app de autenticación.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { usuarioDeRequest } from "../supabase/request.ts";

export const ROLES_PLATAFORMA = ["admin_samgple", "comercial_samgple", "implantacion_samgple", "revisor_samgple", "soporte_samgple", "finanzas_samgple"] as const;
export type RolPlataforma = (typeof ROLES_PLATAFORMA)[number];
export type SesionPlataforma = { userId: string; roles: RolPlataforma[]; nombre: string; categorias: string[]; mfaVerificada: boolean };
export type SesionAdmin = { userId: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const validos = new Set<string>(ROLES_PLATAFORMA);

function tokenDeCabecera(headers: Pick<Headers, "get">): string | null {
  return /^Bearer (.+)$/.exec(headers.get("authorization") ?? "")?.[1] ?? null;
}
function payloadJwt(token: string | null): Record<string, unknown> {
  if (!token) return {};
  try {
    const parte = token.split(".")[1];
    return parte ? JSON.parse(atob(parte.replace(/-/g, "+").replace(/_/g, "/"))) as Record<string, unknown> : {};
  } catch { return {}; }
}
/** Las cookies de @supabase/ssr contienen la sesión codificada; solo se usa para leer AAL tras validar al usuario con Auth. */
function tokenDeCookie(headers: Pick<Headers, "get">): string | null {
  const pares = (headers.get("cookie") ?? "").split(/;\s*/).map((v) => {
    const i = v.indexOf("="); return [i < 0 ? v : v.slice(0, i), i < 0 ? "" : decodeURIComponent(v.slice(i + 1))] as const;
  });
  const candidatos = pares.filter(([k]) => /-auth-token(?:\.\d+)?$/.test(k)).sort(([a], [b]) => a.localeCompare(b)).map(([, v]) => v).join("");
  try {
    const bruto = candidatos.startsWith("base64-") ? atob(candidatos.slice(7)) : candidatos;
    const sesion = JSON.parse(bruto) as { access_token?: string };
    return sesion.access_token ?? null;
  } catch { return null; }
}

export async function sesionPlataforma(headers: Pick<Headers, "get">, db: SupabaseClient): Promise<SesionPlataforma | null> {
  const persona = await usuarioDeRequest(headers);
  if (!persona || !UUID.test(persona.id)) return null;
  const { data } = await db.from("platform_roles").select("rol, roles, nombre, categorias, activo").eq("user_id", persona.id).maybeSingle();
  if (!data || data.activo !== true) return null;
  const roles = [...new Set([data.rol as string, ...((data.roles as string[] | null) ?? [])])].filter((rol): rol is RolPlataforma => validos.has(rol));
  if (roles.length === 0) return null;
  const token = tokenDeCabecera(headers) ?? tokenDeCookie(headers);
  return { userId: persona.id, roles, nombre: (data.nombre as string | null) ?? "Equipo MyOfia", categorias: (data.categorias as string[] | null) ?? [], mfaVerificada: payloadJwt(token).aal === "aal2" };
}

/** Exige al menos uno de los roles indicados y una MFA verificada en esta sesión. */
export async function exigirRolPlataforma(roles: readonly RolPlataforma[], headers: Pick<Headers, "get">, db: SupabaseClient): Promise<SesionPlataforma | null> {
  const sesion = await sesionPlataforma(headers, db);
  if (!sesion || !sesion.mfaVerificada) return null;
  return sesion.roles.includes("admin_samgple") || roles.some((rol) => sesion.roles.includes(rol)) ? sesion : null;
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
