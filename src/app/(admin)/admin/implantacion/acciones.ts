"use server";

/**
 * Acciones de implantación del panel de MyOfia. Envoltorios finos: exigen un rol de plataforma con MFA y delegan en
 * src/lib/admin/implantacion/servicio.ts (permiso concreto, validación, función SQL atómica y auditoría).
 */
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { exigirRolPlataforma, ipDe } from "@/lib/admin/acceso";
import { dbAdminDesdeEntorno } from "@/lib/admin/entorno";
import { ROLES_IMPLANTACION } from "@/lib/admin/implantacion/config";
import * as servicio from "@/lib/admin/implantacion/servicio";
import { ImplantacionError, type Ctx } from "@/lib/admin/implantacion/servicio";

type Hecho<T = object> = ({ ok: true } & T) | { ok: false; mensaje: string };

async function ejecutar<T extends object>(fn: (ctx: Ctx) => Promise<T>, rutas: string[]): Promise<Hecho<T>> {
  const db = dbAdminDesdeEntorno();
  const cab = await headers();
  // Desde la ficha de clientes también se cambian tareas: valen los roles de las dos zonas (cada acción exige el suyo).
  const sesion = db ? await exigirRolPlataforma([...ROLES_IMPLANTACION, "finanzas_samgple"], cab, db) : null;
  if (!db || !sesion) return { ok: false, mensaje: "No encontrado." };
  try {
    const r = await fn({ db, sesion, ip: ipDe(cab) });
    rutas.forEach((r) => revalidatePath(r));
    return { ok: true, ...r };
  } catch (e) {
    if (e instanceof ImplantacionError) return { ok: false, mensaje: e.message };
    console.error("[admin/implantacion]", e instanceof Error ? e.message : "error desconocido");
    return { ok: false, mensaje: "No se pudo completar la operación. Revisa la consola del servidor." };
  }
}

const rutasDe = (input: unknown) => {
  const id = (input as { companyId?: unknown } | null)?.companyId;
  return ["/admin/implantacion", ...(typeof id === "string" ? [`/admin/clientes/${id}`] : [])];
};

export async function cambiarTarea(input: unknown) { return ejecutar(async (c) => ({ resultado: await servicio.cambiarTarea(c, input) }), rutasDe(input)); }
export async function aplicarPlantilla(input: unknown) { return ejecutar(async (c) => ({ resultado: await servicio.aplicarPlantilla(c, input) }), rutasDe(input)); }
export async function guardarPlantilla(input: unknown) { return ejecutar(async (c) => ({ id: await servicio.guardarPlantilla(c, input) }), ["/admin/implantacion/plantillas"]); }
