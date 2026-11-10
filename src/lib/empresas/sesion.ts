/**
 * Sesión de una petición: persona (JWT de Supabase Auth) + EMPRESA ACTIVA. SOLO SERVIDOR.
 * Una persona puede pertenecer a varias empresas: la activa se elige con la cookie `empresa_activa` y SIEMPRE se comprueba que la
 * persona es miembro ACTIVO de esa empresa (y que la empresa no está suspendida). Si la cookie falta o no vale, se usa su primera
 * empresa activa. El cliente nunca decide la empresa: solo propone cuál quiere, y el servidor lo verifica.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { usuarioDeRequest } from "../supabase/request.ts";
import type { RolEmpresa } from "./permisos.ts";

export const COOKIE_EMPRESA_ACTIVA = "empresa_activa";
export type Sesion = { companyId: string; userId: string; rol: RolEmpresa; puedeAprobar: boolean };
export type Membresia = { companyId: string; nombre: string; rol: RolEmpresa; puedeAprobar: boolean; desde: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Empresas en las que la persona es miembro activo (empresas activas), de la más antigua a la más reciente. */
export async function membresiasDe(db: SupabaseClient, userId: string): Promise<Membresia[]> {
  if (!UUID.test(userId)) return [];
  const { data, error } = await db.from("company_members").select("company_id, rol, puede_aprobar, creado_en, companies!inner(name, estado)")
    .eq("user_id", userId).eq("estado", "activo").in("companies.estado", ["activa", "en_implantacion"]).order("creado_en");
  if (error) throw new Error("No se pudieron leer las empresas de la persona.");
  return (data ?? []).map((m) => ({
    companyId: m.company_id as string, nombre: (m.companies as unknown as { name: string }).name, rol: m.rol as RolEmpresa,
    puedeAprobar: m.puede_aprobar === true || m.rol === "propietario" || m.rol === "admin", desde: m.creado_en as string,
  }));
}

/** La cookie de empresa activa de una petición (solo si tiene forma de uuid). */
export function empresaPedida(cabeceras: Pick<Headers, "get">): string | null {
  const v = new RegExp(`(?:^|;\\s*)${COOKIE_EMPRESA_ACTIVA}=([0-9a-fA-F-]{36})(?:;|$)`).exec(cabeceras.get("cookie") ?? "")?.[1];
  return v && UUID.test(v) ? v : null;
}

/** Sesión de la persona en la empresa pedida (o en su primera empresa), o null si no es miembro activo de ninguna. */
export async function sesionEnEmpresa(db: SupabaseClient, userId: string, pedida: string | null): Promise<Sesion | null> {
  const ms = await membresiasDe(db, userId);
  const m = (pedida && ms.find((x) => x.companyId === pedida)) || ms[0];
  return m ? { companyId: m.companyId, userId, rol: m.rol, puedeAprobar: m.puedeAprobar } : null;
}

/**
 * Autenticador de rutas privadas: acepta el JWT Bearer de integraciones y, para el navegador,
 * la sesión httpOnly creada por @supabase/ssr. Nunca cae a una identidad de desarrollo.
 */
export function autenticadorSupabase(db: SupabaseClient, _env: Record<string, string | undefined> = process.env) {
  void _env;
  return async (req: Request): Promise<Sesion | null> => {
    const pedida = empresaPedida(req.headers);
    const cabecera = req.headers.get("authorization");
    if (cabecera !== null) {
      const token = /^Bearer (.+)$/.exec(cabecera)?.[1];
      if (!token) return null;
      const { data, error } = await db.auth.getUser(token);
      return error || !data.user ? null : sesionEnEmpresa(db, data.user.id, pedida);
    }
    const persona = await usuarioDeRequest(req.headers);
    return persona ? sesionEnEmpresa(db, persona.id, pedida) : null;
  };
}

/** Nombres de las personas de una empresa (miembros e invitados), para mostrar quién hizo algo. */
export async function personasDeEmpresa(db: SupabaseClient, companyId: string): Promise<Map<string, string>> {
  const { data: ms, error } = await db.from("company_members").select("user_id").eq("company_id", companyId);
  if (error) throw new Error("No se pudieron leer los miembros.");
  const ids = (ms ?? []).map((m) => m.user_id as string);
  if (ids.length === 0) return new Map();
  const { data } = await db.from("users").select("id, full_name").in("id", ids);
  return new Map((data ?? []).map((u) => [u.id as string, u.full_name as string]));
}

/** Lo mismo con forma de respuesta de Supabase (`{ data: [{ id, full_name }] }`), para encajar en un Promise.all. */
export async function filasDePersonas(db: SupabaseClient, companyId: string): Promise<{ data: { id: string; full_name: string }[] }> {
  return { data: [...(await personasDeEmpresa(db, companyId))].map(([id, full_name]) => ({ id, full_name })) };
}

/** Solo la persona (sin exigir empresa): para listar sus empresas o aceptar una invitación. */
export function identificadorPersona(db: SupabaseClient, _env: Record<string, string | undefined> = process.env) {
  void _env;
  return async (req: Request): Promise<string | null> => {
    const cabecera = req.headers.get("authorization");
    if (cabecera !== null) {
      const token = /^Bearer (.+)$/.exec(cabecera)?.[1];
      if (!token) return null;
      const { data, error } = await db.auth.getUser(token);
      return error || !data.user ? null : data.user.id;
    }
    return (await usuarioDeRequest(req.headers))?.id ?? null;
  };
}
