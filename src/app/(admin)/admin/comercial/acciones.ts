"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { exigirRolPlataforma } from "@/lib/admin/acceso";
import { dbAdminDesdeEntorno } from "@/lib/admin/entorno";
import { darDeAlta, type ResultadoAlta } from "@/lib/admin/comercial/alta";
import { ESTADOS_SOLICITUD, ROLES_COMERCIAL, type EstadoSolicitud } from "@/lib/admin/comercial/config";
import { anadirAccion, anadirNota, completarAccion, fichaSolicitud, moverSolicitud, type FichaSolicitud } from "@/lib/admin/comercial/servicio";

/** Cada acción vuelve a comprobar en el servidor la sesión con MFA y el rol comercial (o administración). */
async function contexto() {
  const db = dbAdminDesdeEntorno();
  if (!db) return null;
  const sesion = await exigirRolPlataforma(ROLES_COMERCIAL, await headers(), db);
  return sesion ? { db, actor: sesion.userId } : null;
}

type Resultado = { ok: true } | { ok: false; mensaje: string };
const SIN_ACCESO: Resultado = { ok: false, mensaje: "No tienes acceso a esta acción." };
const uuid = z.string().uuid();

async function ejecutar(fn: () => Promise<void>): Promise<Resultado> {
  try {
    await fn();
    revalidatePath("/admin/comercial");
    return { ok: true };
  } catch (e) {
    // Los mensajes del servicio son textos propios (sin detalles de la base); cualquier otro error no se enseña.
    const propio = e instanceof Error && /^[A-ZÁÉÍÓÚÑ«¿¡][^\n]{0,160}\.$/.test(e.message) && !/supabase|postgres|sql|duplicate|violates|relation|column/i.test(e.message);
    if (!propio) console.error("[admin/comercial]", e instanceof Error ? e.message : "error desconocido");
    return { ok: false, mensaje: propio ? (e as Error).message : "No se pudo completar." };
  }
}

export async function moverSolicitudAccion(id: string, estado: EstadoSolicitud): Promise<Resultado> {
  const c = await contexto();
  if (!c || !uuid.safeParse(id).success || !ESTADOS_SOLICITUD.includes(estado)) return SIN_ACCESO;
  return ejecutar(() => moverSolicitud(c.db, c.actor, id, estado));
}

export async function fichaSolicitudAccion(id: string): Promise<FichaSolicitud | null> {
  const c = await contexto();
  if (!c || !uuid.safeParse(id).success) return null;
  return fichaSolicitud(c.db, id);
}

export async function notaAccion(id: string, texto: string): Promise<Resultado> {
  const c = await contexto();
  const v = z.string().trim().min(1).max(2000).safeParse(texto);
  if (!c || !uuid.safeParse(id).success || !v.success) return SIN_ACCESO;
  return ejecutar(() => anadirNota(c.db, c.actor, id, v.data));
}

export async function proximaAccionAccion(id: string, a: { texto: string; venceEn: string; responsable: string }): Promise<Resultado> {
  const c = await contexto();
  const v = z.object({ texto: z.string().trim().min(1).max(300), venceEn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), responsable: uuid }).strict().safeParse(a);
  if (!c || !uuid.safeParse(id).success || !v.success) return { ok: false, mensaje: "Revisa la acción: texto, fecha y responsable." };
  return ejecutar(() => anadirAccion(c.db, c.actor, id, v.data));
}

export async function completarAccionAccion(accionId: string): Promise<Resultado> {
  const c = await contexto();
  if (!c || !uuid.safeParse(accionId).success) return SIN_ACCESO;
  return ejecutar(() => completarAccion(c.db, accionId));
}

export async function darDeAltaAccion(datos: unknown): Promise<ResultadoAlta> {
  const c = await contexto();
  if (!c) return { ok: false, mensaje: "No tienes acceso a esta acción." };
  const r = await darDeAlta(c.db, c.actor, datos);
  if (r.ok) {
    revalidatePath("/admin/comercial");
    revalidatePath("/admin/clientes");
  }
  return r;
}
