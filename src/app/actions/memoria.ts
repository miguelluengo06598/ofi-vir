"use server";

/**
 * Corregir un recuerdo y borrar todo lo de un contacto (RGPD) desde la vista Memoria. La empresa y la persona salen de
 * la sesión; solo propietarios y administradores (desde el navegador, contactos y memoria solo los escriben ellos).
 */
import { z } from "zod";
import { sesionDeAccion } from "@/lib/empresas/sesionAccion";
import { esGestor } from "@/lib/empresas/permisos";
import { createMemoryService } from "@/lib/memory/service";
import { SupabaseMemoryStore } from "@/lib/memory/supabaseStore";

type R = { ok: true } | { ok: false; mensaje: string };

async function preparar(): Promise<{ error: string } | { error?: undefined; companyId: string; userId: string; memoria: ReturnType<typeof createMemoryService> }> {
  const sesion = await sesionDeAccion();
  if (!sesion) return { error: "Inicia sesión para continuar." };
  if (!esGestor(sesion.rol)) return { error: "Solo los propietarios y administradores pueden cambiar la memoria." };
  const store = SupabaseMemoryStore.fromEnv();
  if (!store) return { error: "La memoria no está disponible ahora mismo." };
  return { companyId: sesion.companyId, userId: sesion.userId, memoria: createMemoryService({ store, embedder: null }) };
}

export async function corregirRecuerdo(input: { nodeId: string; titulo: string; contenido: string }): Promise<R> {
  const v = z.object({ nodeId: z.uuid(), titulo: z.string().trim().min(1).max(200), contenido: z.string().max(8000) }).strict().safeParse(input);
  if (!v.success) return { ok: false, mensaje: "Revisa el título (1 a 200 caracteres) y el texto." };
  const p = await preparar();
  if (p.error !== undefined) return { ok: false, mensaje: p.error };
  try {
    await p.memoria.corregirNodo(p.companyId, v.data.nodeId, { titulo: v.data.titulo, contenido: v.data.contenido });
    return { ok: true };
  } catch (e) {
    console.error("corregirRecuerdo:", e instanceof Error ? e.message : "error desconocido");
    return { ok: false, mensaje: "No se pudo guardar la corrección." };
  }
}

export async function borrarContactoDeMemoria(input: { contactId: string }): Promise<R> {
  const v = z.object({ contactId: z.uuid() }).strict().safeParse(input);
  if (!v.success) return { ok: false, mensaje: "Contacto no válido." };
  const p = await preparar();
  if (p.error !== undefined) return { ok: false, mensaje: p.error };
  try {
    // Constancia sin datos personales: quién lo pidió va por su id de persona.
    await p.memoria.borrarContacto(p.companyId, v.data.contactId, p.userId);
    return { ok: true };
  } catch (e) {
    console.error("borrarContactoDeMemoria:", e instanceof Error ? e.message : "error desconocido");
    return { ok: false, mensaje: "No se pudo borrar el contacto." };
  }
}
