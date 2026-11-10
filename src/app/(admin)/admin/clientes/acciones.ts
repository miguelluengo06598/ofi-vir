"use server";

/**
 * Acciones de la ficha de clientes. Envoltorios finos: cada una vuelve a exigir un rol de plataforma con MFA y delega en
 * src/lib/admin/clientes/servicio.ts, que comprueba el permiso concreto, valida, hace el cambio y lo anota en la auditoría.
 */
import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { exigirRolPlataforma, ipDe } from "@/lib/admin/acceso";
import { dbAdminDesdeEntorno } from "@/lib/admin/entorno";
import { ROLES_CLIENTES } from "@/lib/admin/clientes/config";
import { generarExportacion } from "@/lib/admin/clientes/exportar";
import * as servicio from "@/lib/admin/clientes/servicio";
import { ClienteError, type Contexto } from "@/lib/admin/clientes/servicio";
import { depsEmpresasDesdeEntorno } from "@/lib/empresas/entorno";

export type Hecho<T = object> = ({ ok: true } & T) | { ok: false; mensaje: string };

async function contexto(): Promise<Contexto | null> {
  const db = dbAdminDesdeEntorno();
  if (!db) return null;
  const cab = await headers();
  const sesion = await exigirRolPlataforma(ROLES_CLIENTES, cab, db);
  return sesion ? { db, sesion, ip: ipDe(cab) } : null;
}

async function ejecutar<T extends object>(input: unknown, fn: (ctx: Contexto) => Promise<T>): Promise<Hecho<T>> {
  const ctx = await contexto();
  if (!ctx) return { ok: false, mensaje: "No encontrado." };
  try {
    const r = await fn(ctx);
    const id = (input as { companyId?: unknown } | null)?.companyId;
    revalidatePath(typeof id === "string" ? `/admin/clientes/${id}` : "/admin/clientes");
    revalidatePath("/admin/clientes");
    return { ok: true, ...r };
  } catch (e) {
    if (e instanceof ClienteError) return { ok: false, mensaje: e.message };
    console.error("[admin/clientes]", e instanceof Error ? e.message : "error desconocido");
    return { ok: false, mensaje: "No se pudo completar la operación. Revisa la consola del servidor." };
  }
}

export async function guardarFicha(input: unknown) { return ejecutar(input, async (c) => { await servicio.guardarFicha(c, input); return {}; }); }
export async function anotar(input: unknown) { return ejecutar(input, async (c) => { await servicio.anotar(c, input); return {}; }); }
export async function guardarFiscales(input: unknown) { return ejecutar(input, async (c) => { await servicio.guardarFiscales(c, input); return {}; }); }
export async function ajustarCreditos(input: unknown) { return ejecutar(input, (c) => servicio.ajustarCreditos(c, input)); }
export async function cambiarEstado(input: unknown) { return ejecutar(input, (c) => servicio.cambiarEstado(c, input)); }
export async function pedirCambioPropietario(input: unknown) { return ejecutar(input, (c) => servicio.pedirCambioPropietario(c, input)); }
export async function resolverCambioPropietario(input: unknown) { return ejecutar(input, async (c) => ({ estado: await servicio.resolverCambioPropietario(c, input) })); }
export async function borrarEmpresa(input: unknown) { return ejecutar(input, (c) => servicio.borrarEmpresa(c, input)); }

export async function reenviarInvitacion(input: unknown) {
  const empresas = depsEmpresasDesdeEntorno();
  return ejecutar(input, (c) => servicio.reenviarInvitacion(c, input, { appUrl: empresas?.appUrl ?? null, enviar: empresas?.enviarInvitacion }));
}

/** Crea la exportación y la genera en segundo plano (después de responder). */
export async function exportar(input: unknown) {
  return ejecutar(input, async (c) => {
    const id = await servicio.pedirExportacion(c, input);
    after(() => generarExportacion(c.db, id));
    return { exportacionId: id };
  });
}
