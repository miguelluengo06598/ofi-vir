"use server";

/**
 * Acciones del panel de certificación. Cada una vuelve a comprobar en el servidor que quien llama es del equipo revisor
 * (`sesionRevisor`): una empresa cliente nunca llega aquí, y si llegara, no obtiene nada.
 */
import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { z } from "zod";
import { COOKIE_DEV_REVISOR, sesionRevisor, type SesionRevisor } from "@/lib/admin/certificacion/acceso";
import { CHECKLIST, DECISIONES } from "@/lib/admin/certificacion/config";
import { decidir, RevisionError, simularParaRevisor, soltarSolicitud, tomarSolicitud } from "@/lib/admin/certificacion/servicio";
import { dbAdminDesdeEntorno } from "@/lib/admin/entorno";
import type { ResultadoSimulacion } from "@/lib/agentes/simulador/servicio";
import { depsExamenDesdeEntorno } from "@/lib/certificacion/entorno";
import { aplicarSancion } from "@/lib/calidad/servicio";

export type Hecho<T = object> = ({ ok: true } & T) | { ok: false; mensaje: string };
const SIN_ACCESO = "No encontrado.";

async function entrar(): Promise<{ db: NonNullable<ReturnType<typeof dbAdminDesdeEntorno>>; sesion: SesionRevisor } | null> {
  const db = dbAdminDesdeEntorno();
  const sesion = db ? await sesionRevisor(await headers(), db) : null;
  return db && sesion ? { db, sesion } : null;
}
function fallo(e: unknown, donde: string): { ok: false; mensaje: string } {
  if (e instanceof RevisionError) return { ok: false, mensaje: e.message };
  console.error(`[admin/certificacion] ${donde}:`, e instanceof Error ? e.message : "error desconocido");
  return { ok: false, mensaje: "No se pudo completar la operación. Revisa la consola del servidor." };
}

const Ref = z.object({ clase: z.enum(["agente", "plantilla"]), id: z.uuid() }).strict();

export async function tomar(input: { clase: "agente" | "plantilla"; id: string }): Promise<Hecho<{ estado: string }>> {
  const v = Ref.safeParse(input);
  const c = await entrar();
  if (!c || !v.success) return { ok: false, mensaje: SIN_ACCESO };
  try {
    const estado = await tomarSolicitud(c.db, c.sesion, v.data);
    revalidatePath("/admin/certificacion", "layout");
    return { ok: true, estado };
  } catch (e) { return fallo(e, "tomar"); }
}

export async function soltar(input: { clase: "agente" | "plantilla"; id: string }): Promise<Hecho> {
  const v = Ref.safeParse(input);
  const c = await entrar();
  if (!c || !v.success) return { ok: false, mensaje: SIN_ACCESO };
  try {
    await soltarSolicitud(c.db, c.sesion, v.data);
    revalidatePath("/admin/certificacion", "layout");
    return { ok: true };
  } catch (e) { return fallo(e, "soltar"); }
}

const Decision = Ref.extend({
  decision: z.enum(DECISIONES),
  checklist: z.array(z.object({ id: z.enum(CHECKLIST.map((p) => p.id) as [string, ...string[]]), ok: z.boolean(), comentario: z.string().max(500).optional() }).strict()).length(CHECKLIST.length),
  comentario: z.string().trim().max(2000).optional(),
  notas: z.string().trim().max(4000).optional(),
}).strict();

export async function decidirSolicitud(input: z.input<typeof Decision>): Promise<Hecho<{ estado: string; segundaOpinion: boolean }>> {
  const v = Decision.safeParse(input);
  const c = await entrar();
  if (!c) return { ok: false, mensaje: SIN_ACCESO };
  if (!v.success) return { ok: false, mensaje: "Revisa la lista de comprobación y la decisión." };
  try {
    const r = await decidir(c.db, c.sesion, v.data as never);
    revalidatePath("/admin/certificacion", "layout");
    return { ok: true, ...r };
  } catch (e) { return fallo(e, "decidir"); }
}

const Simulacion = z.object({ id: z.uuid(), mensaje: z.string().trim().min(1).max(4000), canal: z.enum(["whatsapp", "correo", "interno"]) }).strict();

/** El revisor prueba un caso suyo contra la versión enviada: en la empresa ficticia de examen y en simulación. */
export async function simular(input: z.input<typeof Simulacion>): Promise<Hecho<{ resultado: ResultadoSimulacion }>> {
  const v = Simulacion.safeParse(input);
  const c = await entrar();
  if (!c) return { ok: false, mensaje: SIN_ACCESO };
  if (!v.success) return { ok: false, mensaje: "Escribe un mensaje (hasta 4.000 caracteres)." };
  const deps = depsExamenDesdeEntorno();
  if (!deps) return { ok: false, mensaje: "El simulador necesita ANTHROPIC_API_KEY en el servidor." };
  try {
    return { ok: true, resultado: await simularParaRevisor(deps, { requestId: v.data.id, mensaje: v.data.mensaje, canal: v.data.canal }) };
  } catch (e) { return fallo(e, "simular"); }
}

/** SOLO DESARROLLO (mientras no hay login): cambia la persona revisora con la que se ve el panel, para probar la segunda opinión. */
export async function cambiarRevisorDeDesarrollo(userId: string): Promise<Hecho> {
  if (process.env.NODE_ENV === "production" || !z.uuid().safeParse(userId).success) return { ok: false, mensaje: SIN_ACCESO };
  const c = await entrar();
  if (!c?.sesion.esDeDesarrollo) return { ok: false, mensaje: SIN_ACCESO };
  const { data } = await c.db.from("reviewers").select("user_id").eq("user_id", userId).eq("activo", true).maybeSingle();
  if (!data) return { ok: false, mensaje: "Esa persona no es revisora." };
  (await cookies()).set(COOKIE_DEV_REVISOR, userId, { httpOnly: true, sameSite: "lax", path: "/" });
  revalidatePath("/admin/certificacion", "layout");
  return { ok: true };
}

const SancionCalidad = z.object({
  companyId: z.uuid(), agentId: z.uuid(), kind: z.enum(["warning", "recertification", "suspension", "certification_withdrawal"]),
  reason: z.string().trim().min(1).max(2000), dueAt: z.string().datetime().optional(),
}).strict();

/** Medidas escalonadas: siempre las aplica un revisor desde SAMGPLE; el único automatismo es el incidente grave de seguridad. */
export async function aplicarSancionDeCalidad(input: z.input<typeof SancionCalidad>): Promise<Hecho> {
  const v = SancionCalidad.safeParse(input);
  const c = await entrar();
  if (!c) return { ok: false, mensaje: SIN_ACCESO };
  if (!v.success || (v.data.kind === "recertification" && !v.data.dueAt)) return { ok: false, mensaje: "Indica el motivo y un plazo futuro para la recertificación." };
  try {
    await aplicarSancion(c.db, { companyId: v.data.companyId, agentId: v.data.agentId, reviewerId: c.sesion.userId, kind: v.data.kind, reason: v.data.reason, dueAt: v.data.dueAt ? new Date(v.data.dueAt) : undefined });
    revalidatePath("/admin/certificacion", "layout");
    return { ok: true };
  } catch (e) { return fallo(e, "aplicarSancionDeCalidad"); }
}
