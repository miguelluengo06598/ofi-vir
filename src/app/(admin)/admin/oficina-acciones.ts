"use server";

import { headers } from "next/headers";
import { exigirRolPlataforma, ROLES_PLATAFORMA } from "@/lib/admin/acceso";
import { dbAdminDesdeEntorno } from "@/lib/admin/entorno";
import { sucesosEnDirecto, type Suceso } from "@/lib/admin/oficina/panorama";

/**
 * Acciones de la pantalla principal de /admin. Cada llamada vuelve a comprobar en el servidor la sesión de
 * plataforma con MFA y filtra por rol: el navegador nunca decide qué puede ver.
 */
export async function cargarEnDirecto(): Promise<{ ok: true; sucesos: Suceso[] } | { ok: false }> {
  const db = dbAdminDesdeEntorno();
  if (!db) return { ok: false };
  const sesion = await exigirRolPlataforma(ROLES_PLATAFORMA, await headers(), db);
  if (!sesion) return { ok: false };
  try {
    return { ok: true, sucesos: await sucesosEnDirecto(db, sesion.roles) };
  } catch {
    return { ok: false };
  }
}
