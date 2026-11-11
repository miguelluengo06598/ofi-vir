/**
 * Configuración inicial: crear la primera cuenta de administrador general (admin_samgple) desde la web.
 *
 *  - Solo funciona mientras no exista ningún admin_samgple (lo decide la base: `plataforma_tiene_admin`,
 *    y `plataforma_crear_primer_admin` lo vuelve a comprobar con un candado). Después, la página da 404.
 *  - Exige la clave de instalación `CONFIGURACION_INICIAL_CLAVE` (≥ 24 caracteres, solo en el servidor):
 *    sin ella nadie puede adelantarse y quedarse con la plataforma entre el despliegue y tu alta.
 *  - Si algo falla después de crear la cuenta de Supabase Auth, la cuenta se borra: no quedan cuentas a medias.
 */
import { timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

export const LONGITUD_MINIMA_CLAVE = 24;

export type ResultadoPrimerAdmin =
  | { ok: true; userId: string }
  | { ok: false; motivo: "cerrada" | "sin_clave" | "clave_incorrecta" | "correo_en_uso" | "error" };

/** La clave de instalación configurada, o null si falta o es demasiado corta. */
export function claveDeInstalacion(): string | null {
  const clave = process.env.CONFIGURACION_INICIAL_CLAVE?.trim();
  return clave && clave.length >= LONGITUD_MINIMA_CLAVE ? clave : null;
}

/** Compara en tiempo constante (no revela por el tiempo de respuesta cuántos caracteres coinciden). */
export function claveCorrecta(escrita: string, esperada: string): boolean {
  const a = Buffer.from(escrita);
  const b = Buffer.from(esperada);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** true mientras no exista ningún administrador general. Ante cualquier error, cerrada (nunca abre por defecto). */
export async function configuracionAbierta(db: SupabaseClient): Promise<boolean> {
  const { data, error } = await db.rpc("plataforma_tiene_admin");
  if (error) {
    console.error("configuracion-inicial: no se pudo comprobar si hay administrador:", error.code);
    return false;
  }
  return data === false;
}

export async function crearPrimerAdmin(
  db: SupabaseClient,
  datos: { nombre: string; email: string; password: string; clave: string; ip: string | null },
): Promise<ResultadoPrimerAdmin> {
  const esperada = claveDeInstalacion();
  if (!esperada) return { ok: false, motivo: "sin_clave" };
  if (!claveCorrecta(datos.clave, esperada)) return { ok: false, motivo: "clave_incorrecta" };
  if (!(await configuracionAbierta(db))) return { ok: false, motivo: "cerrada" };

  const creado = await db.auth.admin.createUser({
    email: datos.email,
    password: datos.password,
    email_confirm: true,
    user_metadata: { full_name: datos.nombre },
  });
  if (creado.error || !creado.data.user) {
    const enUso = creado.error?.status === 422 || /already|registered|exists/i.test(creado.error?.message ?? "");
    console.error("configuracion-inicial: no se pudo crear la cuenta:", creado.error?.code ?? creado.error?.status);
    return { ok: false, motivo: enUso ? "correo_en_uso" : "error" };
  }
  const userId = creado.data.user.id;

  const rol = await db.rpc("plataforma_crear_primer_admin", { p_user_id: userId, p_nombre: datos.nombre, p_email: datos.email, p_ip: datos.ip });
  if (rol.error) {
    // Sin rol no sirve de nada: se borra para no dejar una cuenta huérfana (y, si otra petición ganó, cerrada).
    await db.auth.admin.deleteUser(userId);
    const cerrada = /YA_CONFIGURADO/.test(rol.error.message);
    if (!cerrada) console.error("configuracion-inicial: no se pudo asignar el rol:", rol.error.code);
    return { ok: false, motivo: cerrada ? "cerrada" : "error" };
  }
  return { ok: true, userId };
}
