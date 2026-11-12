/**
 * Sesión para las ACCIONES DE SERVIDOR (no tienen un `Request` que pasar al autenticador de las rutas de API).
 * La persona sale de la cookie de Supabase Auth y la empresa de `empresa_activa`, verificada contra sus pertenencias
 * activas, igual que en `/oficina`. Solo en local y sin nadie con sesión se usa la persona de desarrollo (DEV_*):
 * en producción, sin sesión no hay acción.
 */
import { headers } from "next/headers";
import { devContext } from "../devContext.ts";
import { supabaseAdmin, usuarioActual } from "../supabase/server.ts";
import { empresaPedida, sesionEnEmpresa, type Sesion } from "./sesion.ts";

export async function sesionDeAccion(): Promise<Sesion | null> {
  let db;
  try { db = supabaseAdmin(); } catch { return null; }
  const persona = await usuarioActual().catch(() => null);
  if (persona) return sesionEnEmpresa(db, persona.id, empresaPedida(await headers()));
  const dev = devContext();
  return dev ? sesionEnEmpresa(db, dev.userId, dev.companyId) : null;
}
