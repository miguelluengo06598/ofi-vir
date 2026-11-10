/**
 * Entorno compartido de las pruebas de seguridad: se ejecutan contra la base de datos LOCAL real, con usuarios reales
 * (JWT de Supabase Auth) de dos empresas. Crean sus propios datos con nombres únicos y los borran al terminar.
 */
import { execFileSync } from "node:child_process";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { altaEnEmpresa } from "../ayuda/miembros.ts";

// Sin red hacia Voyage ni Resend: nada de estas pruebas sale de tu máquina.
process.env.VOYAGE_API_KEY = "";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? "";
export const COMPANY_A = process.env.DEV_COMPANY_ID?.trim() ?? "";

if (!url || !serviceKey || !anonKey || !COMPANY_A) throw new Error("Faltan variables de Supabase: ejecuta con `npm run test:seguridad` (usa .env.local).");
if (!/^https?:\/\/(127\.0\.0\.1|localhost)[:/]/.test(url)) throw new Error(`Estas pruebas crean y borran datos: solo contra la base LOCAL (${url} no lo es).`);

export const SUPABASE_URL = url;
export const admin: SupabaseClient = createClient(url, serviceKey, { auth: { persistSession: false } });
export const COMPANY_B = "b0000000-0000-4000-8000-0000000005ec";
export const RUN = Date.now().toString(36);

/** Cliente con la sesión real de una persona (lo que haría el navegador: clave anónima + JWT del usuario). */
export async function loginAs(email: string, password: string): Promise<SupabaseClient> {
  const c = createClient(url, anonKey, { auth: { persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`No se pudo iniciar sesión como ${email}: ${error.message}`);
  return c;
}
export const anonymous = (): SupabaseClient => createClient(url, anonKey, { auth: { persistSession: false } });

export async function createUser(companyId: string, role: "owner" | "admin" | "member", label: string) {
  const email = `sec-${label}-${RUN}@test.example`;
  const password = `Pw-${RUN}-${label}-Aa1!`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw new Error(`No se pudo crear el usuario de prueba: ${error?.message}`);
  const { error: e2 } = await altaEnEmpresa(admin, { id: data.user.id, companyId, nombre: `Prueba ${label}`, email, rol: role });
  if (e2) throw new Error(`No se pudo registrar al usuario: ${e2.message}`);
  return { id: data.user.id, email, client: await loginAs(email, password) };
}

/** SQL directo en la base local (para barridos y ataques que PostgREST no permite). Solo desarrollo local. */
export function psql(sql: string): string {
  try {
    return execFileSync("docker", ["exec", "supabase_db_oficina-virtual", "psql", "-U", "postgres", "-At", "-c", sql], { encoding: "utf8" }).trim();
  } catch (e) {
    const msg = (e as { stderr?: string }).stderr ?? String(e);
    throw new Error(msg.trim().split("\n").slice(0, 2).join(" "));
  }
}

export async function must<T>(p: PromiseLike<{ data: T; error: { message: string } | null }>, what: string): Promise<NonNullable<T>> {
  const { data, error } = await p;
  if (error || data === null || data === undefined) throw new Error(`${what}: ${error?.message ?? "sin datos"}`);
  return data as NonNullable<T>;
}
