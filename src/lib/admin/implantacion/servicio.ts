/**
 * Implantación desde MyOfia (SOLO SERVIDOR): listado de las implantaciones en curso, tareas de una empresa, plantillas y cambios
 * a mano. Todo cambio pasa por funciones SQL atómicas que vuelven a comprobar las reglas (dependencias, quién puede marcar qué)
 * y queda en admin_audit_log. Solo metadatos: nada de contenido de la empresa.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { registrarAuditoria, type SesionPlataforma } from "../acceso.ts";
import { PlantillaSchema, problemaDePlantilla, puedeEditarImplantacion, type Plantilla } from "./config.ts";

export class ImplantacionError extends Error {}
export type Ctx = { db: SupabaseClient; sesion: SesionPlataforma; ip: string | null };

const n = (v: unknown) => Number(v ?? 0) || 0;
function deSql(e: { code?: string; message?: string }, porDefecto: string) {
  const m = e.message ?? "";
  const legible = /^[A-Z_]+: (.+)$/.exec(m)?.[1];
  if (/DEPENDENCIAS_PENDIENTES|SE_COMPRUEBA_SOLA|DEPENDENCIA_INVALIDA|IMPLANTACION_COMPLETADA|SIN_TAREAS/.test(m) && legible) return new ImplantacionError(legible.charAt(0).toUpperCase() + legible.slice(1) + ".");
  if (/CLAVE_REPETIDA/.test(m)) return new ImplantacionError("Hay claves de tarea repetidas.");
  if (/PLANTILLA_NO_DISPONIBLE/.test(m)) return new ImplantacionError("Esa plantilla no existe o no está activa.");
  if (/RESPONSABLE_NO_VALIDO/.test(m)) return new ImplantacionError("El responsable debe ser una persona activa de MyOfia.");
  if (e.code === "23505") return new ImplantacionError("Ya existe una plantilla con ese nombre.");
  if (e.code === "42501") return new ImplantacionError("Tu rol no permite esta acción.");
  if (e.code === "P0002") return new ImplantacionError("No existe.");
  console.error("[admin/implantacion]", e.code ?? "sin código");
  return new ImplantacionError(porDefecto);
}
function exigirEdicion(ctx: Ctx) {
  if (!puedeEditarImplantacion(ctx.sesion.roles)) throw new ImplantacionError("Tu rol no permite esta acción.");
}

// ── Listado ─────────────────────────────────────────────────────────────────────────────────────
export type FilaImplantacion = {
  implantacionId: string; companyId: string; empresa: string; estadoEmpresa: string; responsable: { id: string; nombre: string } | null;
  inicio: string; objetivoFin: string | null; alta: string; diasDesdeAlta: number; total: number; hechas: number; obligatorias: number;
  obligatoriasHechas: number; progreso: number; atrasadas: number; atrasadasSamgple: number; atrasadasCliente: number;
  proxima: string | null; proximaVence: string | null; plantilla: string | null;
};
export async function listarImplantaciones(db: SupabaseClient, ahora = new Date()): Promise<FilaImplantacion[]> {
  const hoy = ahora.toLocaleDateString("sv-SE", { timeZone: "Europe/Madrid" });
  const { data, error } = await db.rpc("admin_implantaciones", { p_hoy: hoy });
  if (error) throw new Error(`No se pudieron leer las implantaciones (${error.code ?? "sin código"}).`);
  return ((data ?? []) as Record<string, unknown>[]).map((r) => {
    const total = n(r.total), hechas = n(r.hechas);
    return {
      implantacionId: r.implantacion_id as string, companyId: r.company_id as string, empresa: r.empresa as string, estadoEmpresa: r.estado_empresa as string,
      responsable: r.responsable_id ? { id: r.responsable_id as string, nombre: (r.responsable as string | null) ?? "Equipo MyOfia" } : null,
      inicio: r.inicio as string, objetivoFin: (r.objetivo_fin as string | null) ?? null, alta: r.alta as string,
      diasDesdeAlta: Math.max(0, Math.floor((ahora.getTime() - new Date(r.alta as string).getTime()) / 86_400_000)),
      total, hechas, obligatorias: n(r.obligatorias), obligatoriasHechas: n(r.obligatorias_hechas), progreso: total ? Math.round((hechas / total) * 100) : 0,
      atrasadas: n(r.atrasadas), atrasadasSamgple: n(r.atrasadas_samgple), atrasadasCliente: n(r.atrasadas_cliente),
      proxima: (r.proxima as string | null) ?? null, proximaVence: (r.proxima_vence as string | null) ?? null, plantilla: (r.plantilla as string | null) ?? null,
    };
  });
}

// ── Tareas de una empresa ───────────────────────────────────────────────────────────────────────
export type TareaImplantacion = {
  id: string; titulo: string; para: "samgple" | "cliente"; estado: string; obligatoria: boolean; venceEn: string | null; hechaEn: string | null;
  marcadaAuto: boolean; comprobacion: string | null; accion: string | null; ayuda: string | null; agentId: string | null; proveedor: string | null;
  responsable: { id: string; nombre: string } | null; dependeDe: { id: string; titulo: string; hecha: boolean }[]; bloqueada: boolean; atrasada: boolean; orden: number;
};
export type Implantacion = {
  id: string; estado: string; inicio: string; objetivoFin: string | null; completadaEn: string | null; plantillaId: string | null;
  responsable: { id: string; nombre: string } | null; tareas: TareaImplantacion[];
};

export async function implantacionDeEmpresa(db: SupabaseClient, companyId: string, ahora = new Date()): Promise<Implantacion | null> {
  const { data: i, error } = await db.from("implantaciones").select("id, estado, inicio, objetivo_fin, completada_en, plantilla_id, responsable").eq("company_id", companyId).maybeSingle();
  if (error) throw new Error("No se pudo leer la implantación.");
  if (!i) return null;
  const { data: filas, error: e2 } = await db.from("implantacion_tareas")
    .select("id, titulo, para, estado, obligatoria, vence_en, hecha_en, marcada_auto, comprobacion, accion, ayuda, agent_id, proveedor, responsable, depende_de, orden")
    .eq("implantacion_id", i.id).order("orden").order("titulo");
  if (e2) throw new Error("No se pudieron leer las tareas.");
  const ids = [...new Set([i.responsable as string, ...(filas ?? []).map((t) => t.responsable as string)].filter(Boolean))];
  const { data: personas } = ids.length ? await db.from("platform_roles").select("user_id, nombre").in("user_id", ids) : { data: [] };
  const nombre = new Map((personas ?? []).map((p) => [p.user_id as string, (p.nombre as string | null) ?? "Equipo MyOfia"]));
  const porId = new Map((filas ?? []).map((t) => [t.id as string, t]));
  const hoy = ahora.toLocaleDateString("sv-SE", { timeZone: "Europe/Madrid" });
  return {
    id: i.id, estado: i.estado, inicio: i.inicio, objetivoFin: i.objetivo_fin, completadaEn: i.completada_en, plantillaId: i.plantilla_id,
    responsable: i.responsable ? { id: i.responsable, nombre: nombre.get(i.responsable) ?? "Equipo MyOfia" } : null,
    tareas: (filas ?? []).map((t) => {
      const deps = ((t.depende_de as string[] | null) ?? []).map((id) => porId.get(id)).filter(Boolean).map((d) => ({ id: d!.id as string, titulo: d!.titulo as string, hecha: d!.estado === "hecha" || d!.estado === "descartada" }));
      const abierta = t.estado === "pendiente" || t.estado === "en_curso";
      return {
        id: t.id, titulo: t.titulo, para: t.para, estado: t.estado, obligatoria: t.obligatoria, venceEn: t.vence_en, hechaEn: t.hecha_en, marcadaAuto: t.marcada_auto,
        comprobacion: t.comprobacion, accion: t.accion, ayuda: t.ayuda, agentId: t.agent_id, proveedor: t.proveedor, orden: t.orden,
        responsable: t.responsable ? { id: t.responsable, nombre: nombre.get(t.responsable) ?? "Equipo MyOfia" } : null,
        dependeDe: deps, bloqueada: abierta && deps.some((d) => !d.hecha), atrasada: abierta && !!t.vence_en && t.vence_en < hoy,
      };
    }),
  };
}

// ── Cambios a mano (MyOfia) ────────────────────────────────────────────────────────────────────
const TareaCambioSchema = z.object({
  companyId: z.uuid(),
  tareaId: z.uuid(),
  estado: z.enum(["pendiente", "en_curso", "hecha", "descartada"]).optional(),
  responsable: z.uuid().nullable().optional(),
  venceEn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  motivo: z.string().trim().max(500).optional(),
}).strict().refine((v) => v.estado !== undefined || v.responsable !== undefined || v.venceEn !== undefined, "No hay nada que cambiar.");

export async function cambiarTarea(ctx: Ctx, input: unknown) {
  exigirEdicion(ctx);
  const v = TareaCambioSchema.safeParse(input);
  if (!v.success) throw new ImplantacionError(v.error.issues[0]?.message ?? "Datos no válidos.");
  // La tarea debe ser de esa empresa (el id de empresa viene de la página; la base no se fía de él).
  const { data: t } = await ctx.db.from("implantacion_tareas").select("id, titulo, estado, responsable, vence_en, implantaciones!inner(company_id)").eq("id", v.data.tareaId).eq("implantaciones.company_id", v.data.companyId).maybeSingle();
  if (!t) throw new ImplantacionError("Esa tarea no existe.");
  if (v.data.estado === "descartada" && !(v.data.motivo && v.data.motivo.length >= 3)) throw new ImplantacionError("Para descartar una tarea, escribe el motivo.");
  const { data, error } = await ctx.db.rpc("implantacion_tarea_actualizar", {
    p_tarea_id: v.data.tareaId, p_actor: ctx.sesion.userId, p_via: "samgple", p_estado: v.data.estado ?? null,
    p_responsable: v.data.responsable ?? null, p_cambiar_responsable: v.data.responsable !== undefined, p_vence_en: v.data.venceEn ?? null,
  });
  if (error) throw deSql(error, "No se pudo cambiar la tarea.");
  await registrarAuditoria(ctx.db, {
    actorId: ctx.sesion.userId, ip: ctx.ip, accion: "implantacion.tarea", companyId: v.data.companyId, objetoTipo: "implantacion_tarea", objetoId: v.data.tareaId,
    antes: { titulo: t.titulo, estado: t.estado, responsable: t.responsable, vence_en: t.vence_en },
    despues: { estado: v.data.estado, responsable: v.data.responsable, vence_en: v.data.venceEn, resultado: data }, motivo: v.data.motivo || null,
  });
  return data as { completada?: boolean };
}

export async function aplicarPlantilla(ctx: Ctx, input: unknown) {
  exigirEdicion(ctx);
  const v = z.object({ companyId: z.uuid(), plantillaId: z.uuid() }).strict().safeParse(input);
  if (!v.success) throw new ImplantacionError("Elige una plantilla.");
  const { data: i } = await ctx.db.from("implantaciones").select("id, plantilla_id").eq("company_id", v.data.companyId).maybeSingle();
  if (!i) throw new ImplantacionError("Esta empresa no tiene implantación.");
  const { data, error } = await ctx.db.rpc("implantacion_aplicar_plantilla", { p_implantacion_id: i.id, p_template_id: v.data.plantillaId });
  if (error) throw deSql(error, "No se pudo aplicar la plantilla.");
  await registrarAuditoria(ctx.db, { actorId: ctx.sesion.userId, ip: ctx.ip, accion: "implantacion.plantilla", companyId: v.data.companyId, objetoTipo: "implantacion", objetoId: i.id, antes: { plantilla: i.plantilla_id }, despues: { plantilla: v.data.plantillaId, resultado: data } });
  return data as { nuevas?: number };
}

// ── Plantillas ──────────────────────────────────────────────────────────────────────────────────
export type PlantillaGuardada = Plantilla & { id: string; actualizadoEn: string; usos: number };

export async function listarPlantillas(db: SupabaseClient): Promise<PlantillaGuardada[]> {
  const [{ data, error }, { data: usos }] = await Promise.all([
    db.from("onboarding_templates").select("id, nombre, descripcion, por_defecto, activa, actualizado_en, onboarding_template_tareas(clave, titulo, para, ambito, proveedor, obligatoria, dias_objetivo, ayuda, comprobacion, accion, depende_de, orden)").order("nombre"),
    db.from("implantaciones").select("plantilla_id").not("plantilla_id", "is", null),
  ]);
  if (error) throw new Error("No se pudieron leer las plantillas.");
  const cuenta = new Map<string, number>();
  for (const u of usos ?? []) cuenta.set(u.plantilla_id as string, (cuenta.get(u.plantilla_id as string) ?? 0) + 1);
  return (data ?? []).map((p) => ({
    id: p.id, nombre: p.nombre, descripcion: p.descripcion, por_defecto: p.por_defecto, activa: p.activa, actualizadoEn: p.actualizado_en, usos: cuenta.get(p.id) ?? 0,
    tareas: ((p.onboarding_template_tareas ?? []) as (Plantilla["tareas"][number] & { orden: number })[]).sort((a, b) => a.orden - b.orden).map(({ orden: _o, ...t }) => { void _o; return t; }),
  }));
}

export async function guardarPlantilla(ctx: Ctx, input: unknown): Promise<string> {
  exigirEdicion(ctx);
  const v = z.object({ id: z.uuid().nullable(), plantilla: PlantillaSchema }).strict().safeParse(input);
  if (!v.success) throw new ImplantacionError(v.error.issues[0]?.message ?? "Revisa la plantilla.");
  const problema = problemaDePlantilla(v.data.plantilla);
  if (problema) throw new ImplantacionError(problema);
  const { data, error } = await ctx.db.rpc("onboarding_plantilla_guardar", { p_template_id: v.data.id, p_datos: v.data.plantilla, p_actor: ctx.sesion.userId });
  if (error) throw deSql(error, "No se pudo guardar la plantilla.");
  await registrarAuditoria(ctx.db, { actorId: ctx.sesion.userId, ip: ctx.ip, accion: v.data.id ? "implantacion.plantilla_editar" : "implantacion.plantilla_crear", objetoTipo: "onboarding_template", objetoId: data as string, despues: { nombre: v.data.plantilla.nombre, tareas: v.data.plantilla.tareas.length, por_defecto: v.data.plantilla.por_defecto, activa: v.data.plantilla.activa } });
  return data as string;
}
