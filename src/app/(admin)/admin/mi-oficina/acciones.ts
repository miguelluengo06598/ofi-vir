"use server";

import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { exigirRolPlataforma, ipDe } from "@/lib/admin/acceso";
import { dbAdminDesdeEntorno } from "@/lib/admin/entorno";
import { crearOficinaPropia, oficinasDe, OficinaPropiaError } from "@/lib/admin/oficinaPropia";
import { COOKIE_EMPRESA_ACTIVA } from "@/lib/empresas/sesion";

export type EstadoMiOficina = { error?: string };

async function contexto() {
  const db = dbAdminDesdeEntorno();
  const cab = await headers();
  const sesion = db ? await exigirRolPlataforma(["admin_samgple"], cab, db) : null;
  return db && sesion ? { db, sesion, ip: ipDe(cab) } : null;
}

async function activar(companyId: string) {
  (await cookies()).set(COOKIE_EMPRESA_ACTIVA, companyId, { path: "/", httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 24 * 30 });
}

export async function crearMiOficina(_anterior: EstadoMiOficina, datos: FormData): Promise<EstadoMiOficina> {
  const c = await contexto();
  if (!c) return { error: "No encontrado." };
  try {
    const oficina = await crearOficinaPropia(c.db, c.sesion, { nombre: datos.get("nombre") ?? "" }, c.ip);
    await activar(oficina.companyId);
  } catch (e) {
    if (e instanceof OficinaPropiaError) return { error: e.message };
    console.error("[admin/mi-oficina]", e instanceof Error ? e.message : "error desconocido");
    return { error: "No se pudo crear la oficina. Inténtalo de nuevo." };
  }
  revalidatePath("/admin/mi-oficina");
  revalidatePath("/admin/clientes");
  redirect("/admin/mi-oficina");
}

/** Deja esa oficina como empresa activa y entra. Solo vale una empresa de la que la persona es miembro activo. */
export async function entrarEnMiOficina(datos: FormData): Promise<void> {
  const c = await contexto();
  const id = z.uuid().safeParse(datos.get("companyId"));
  if (!c || !id.success) return;
  if (!(await oficinasDe(c.db, c.sesion.userId)).some((o) => o.companyId === id.data)) return;
  await activar(id.data);
  redirect("/oficina");
}
