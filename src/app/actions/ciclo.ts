"use server";

/**
 * Acciones de servidor del ciclo de vida de un agente (estado, certificación, versiones, plantilla y correcciones). Misma lógica y los
 * mismos permisos que las rutas /api/agentes/[id]/…: la empresa y la persona salen de la sesión (hoy, la persona de desarrollo) y nunca
 * de lo que mande la interfaz.
 */
import { after } from "next/server";
import { z } from "zod";
import { guardarCorreccion, listarCorrecciones, MAX_REGLA, proponerRegla, retirarCorreccion, type CorreccionVista } from "@/lib/agentes/correcciones/servicio";
import { depsCicloDesdeEntorno, type DepsApiCiclo } from "@/lib/agentes/versiones/api";
import {
  actualizarPlantilla, cambiarEstado, cancelarSolicitud, cicloDelAgente, CicloError, listarVersiones, restaurarVersion,
  type CicloDelAgente, type EnvioCertificacion, type VersionVista,
} from "@/lib/agentes/versiones/servicio";
import { depsExamenDesdeEntorno } from "@/lib/certificacion/entorno";
import { ejecutarExamen } from "@/lib/certificacion/examen";
import { CertificacionError, enviarACertificacion } from "@/lib/certificacion/solicitudes";
import type { Sesion } from "@/lib/creditos/api";

export type Resultado<T> = ({ ok: true } & T) | { ok: false; mensaje: string; faltan?: string[] };

type Contexto = { api: DepsApiCiclo; sesion: Sesion; agentId: string };
const SIN_BACKEND = "No hay backend configurado: esta parte solo funciona con el backend real.";

async function contexto(agentSlug: string, o: { soloAdmin: boolean }): Promise<Contexto | { error: string }> {
  const slug = z.string().min(1).max(100).safeParse(agentSlug);
  const api = depsCicloDesdeEntorno((p) => after(() => p));
  if (!slug.success || !api) return { error: SIN_BACKEND };
  const sesion = await api.autenticar(new Request("http://accion.local"));
  if (!sesion) return { error: SIN_BACKEND };
  if (o.soloAdmin && sesion.rol !== "owner" && sesion.rol !== "admin") return { error: "Solo los propietarios y administradores pueden cambiar un agente." };
  const { data } = await api.deps.db.from("agents").select("id").eq("company_id", sesion.companyId).eq("slug", slug.data).maybeSingle();
  return data ? { api, sesion, agentId: data.id as string } : { error: "Este agente no existe en la base de datos." };
}

function fallo(e: unknown, donde: string): { ok: false; mensaje: string; faltan?: string[] } {
  if (e instanceof CertificacionError) return { ok: false, mensaje: e.message, ...(e.faltan ? { faltan: e.faltan.map((f) => f.mensaje) } : {}) };
  if (e instanceof CicloError) return { ok: false, mensaje: e.message };
  console.error(`${donde}:`, e instanceof Error ? e.message : "error desconocido");
  return { ok: false, mensaje: "No se pudo completar la operación. Revisa la consola del servidor." };
}
const ids = (c: Contexto) => ({ companyId: c.sesion.companyId, agentId: c.agentId, userId: c.sesion.userId });

/** Estado del agente, lo que falta para certificarlo, la solicitud en curso y si hay plantilla nueva. null sin backend o sin agente. */
export async function cicloDeAgente(agentSlug: string): Promise<CicloDelAgente | null> {
  try {
    const c = await contexto(agentSlug, { soloAdmin: false });
    return "error" in c ? null : await cicloDelAgente(c.api.deps.db, c.sesion.companyId, c.agentId);
  } catch (e) {
    console.error("cicloDeAgente:", e instanceof Error ? e.message : "error desconocido");
    return null;
  }
}

/** Envía el agente a certificación y lanza el examen técnico en segundo plano. Si falta algo, devuelve la lista. */
export async function enviarAgenteACertificacion(agentSlug: string, opciones: { activarAlAprobar?: boolean } = {}): Promise<Resultado<{ tipo: string; via: string }>> {
  try {
    const c = await contexto(agentSlug, { soloAdmin: true });
    if ("error" in c) return { ok: false, mensaje: c.error };
    const s = await enviarACertificacion(c.api.deps.db, { ...ids(c), activarAlAprobar: opciones.activarAlAprobar === true });
    const examen = depsExamenDesdeEntorno();
    if (examen) after(() => ejecutarExamen(examen, { companyId: c.sesion.companyId, requestId: s.requestId }).catch((e) => console.error("examen de certificación:", e instanceof Error ? e.message : "desconocido")));
    return { ok: true, tipo: s.tipo, via: s.via };
  } catch (e) {
    return fallo(e, "enviarAgenteACertificacion");
  }
}

export async function cambiarEstadoDeAgente(input: { agentSlug: string; accion: "activar" | "pausar" | "archivar" }): Promise<Resultado<{ estado: string }>> {
  const accion = z.enum(["activar", "pausar", "archivar"]).safeParse(input.accion);
  if (!accion.success) return { ok: false, mensaje: "Acción no válida." };
  try {
    const c = await contexto(input.agentSlug, { soloAdmin: true });
    if ("error" in c) return { ok: false, mensaje: c.error };
    return { ok: true, estado: await cambiarEstado(c.api.deps.db, { companyId: c.sesion.companyId, agentId: c.agentId, accion: accion.data }) };
  } catch (e) {
    return fallo(e, "cambiarEstadoDeAgente");
  }
}

export async function cancelarCertificacionDeAgente(agentSlug: string): Promise<Resultado<object>> {
  try {
    const c = await contexto(agentSlug, { soloAdmin: true });
    if ("error" in c) return { ok: false, mensaje: c.error };
    await cancelarSolicitud(c.api.deps.db, { companyId: c.sesion.companyId, agentId: c.agentId });
    return { ok: true };
  } catch (e) {
    return fallo(e, "cancelarCertificacionDeAgente");
  }
}

/** Historial de versiones con sus diferencias y certificaciones. */
export async function historialDeAgente(agentSlug: string): Promise<VersionVista[] | null> {
  try {
    const c = await contexto(agentSlug, { soloAdmin: false });
    return "error" in c ? null : (await listarVersiones(c.api.deps.db, c.sesion.companyId, c.agentId)).versiones;
  } catch (e) {
    console.error("historialDeAgente:", e instanceof Error ? e.message : "error desconocido");
    return null;
  }
}

export type VueltaAVersion = { version: number; reactivada: boolean; aplicada: boolean; certificacion: EnvioCertificacion | null };
export async function volverAVersion(input: { agentSlug: string; version: number }): Promise<Resultado<VueltaAVersion>> {
  const version = z.number().int().min(1).safeParse(input.version);
  if (!version.success) return { ok: false, mensaje: "Versión no válida." };
  try {
    const c = await contexto(input.agentSlug, { soloAdmin: true });
    if ("error" in c) return { ok: false, mensaje: c.error };
    const r = await restaurarVersion(c.api.deps, { ...ids(c), version: version.data });
    return { ok: true, version: r.version, reactivada: r.reactivada, aplicada: r.aplicada, certificacion: r.certificacion };
  } catch (e) {
    return fallo(e, "volverAVersion");
  }
}

export async function actualizarPlantillaDeAgente(agentSlug: string): Promise<Resultado<{ version: number; aplicada: boolean; certificacion: EnvioCertificacion | null }>> {
  try {
    const c = await contexto(agentSlug, { soloAdmin: true });
    if ("error" in c) return { ok: false, mensaje: c.error };
    const r = await actualizarPlantilla(c.api.deps, ids(c));
    return { ok: true, version: r.version, aplicada: r.aplicada, certificacion: r.certificacion };
  } catch (e) {
    return fallo(e, "actualizarPlantillaDeAgente");
  }
}

// ── Correcciones («Recordar para la próxima») ────────────────────────────────────────────────────────
const textoLargo = z.string().trim().min(1).max(8000);
const EdicionSchema = z.object({ contexto: z.string().trim().max(4000), original: textoLargo, corregida: textoLargo });

export async function correccionesDeAgente(agentSlug: string): Promise<{ correcciones: CorreccionVista[]; maximo: number } | null> {
  try {
    const c = await contexto(agentSlug, { soloAdmin: false });
    return "error" in c ? null : await listarCorrecciones(c.api.deps.db, c.sesion.companyId, c.agentId);
  } catch (e) {
    console.error("correccionesDeAgente:", e instanceof Error ? e.message : "error desconocido");
    return null;
  }
}

/** Claude Haiku resume la corrección en una regla corta. No guarda nada: la persona puede editarla antes. */
export async function proponerCorreccion(input: { agentSlug: string; contexto: string; original: string; corregida: string }): Promise<Resultado<{ regla: string }>> {
  const v = EdicionSchema.safeParse(input);
  if (!v.success || v.data.original === v.data.corregida) return { ok: false, mensaje: "No hay ninguna corrección que resumir." };
  try {
    const c = await contexto(input.agentSlug, { soloAdmin: false });
    if ("error" in c) return { ok: false, mensaje: c.error };
    if (!c.api.llm) return { ok: false, mensaje: "Falta ANTHROPIC_API_KEY para proponer la regla: escríbela tú." };
    return { ok: true, regla: (await proponerRegla(c.api.llm, v.data)).regla };
  } catch (e) {
    return fallo(e, "proponerCorreccion");
  }
}

export async function guardarCorreccionDeAgente(input: { agentSlug: string; contexto: string; original: string; corregida: string; regla: string }): Promise<Resultado<{ activa: boolean; certificacion: EnvioCertificacion | null }>> {
  const v = EdicionSchema.extend({ regla: z.string().trim().min(3).max(MAX_REGLA) }).safeParse(input);
  if (!v.success) return { ok: false, mensaje: `La regla debe tener entre 3 y ${MAX_REGLA} caracteres.` };
  try {
    const c = await contexto(input.agentSlug, { soloAdmin: false });
    if ("error" in c) return { ok: false, mensaje: c.error };
    const r = await guardarCorreccion(c.api.deps, { ...ids(c), ...v.data });
    return { ok: true, activa: r.activa, certificacion: r.certificacion };
  } catch (e) {
    return fallo(e, "guardarCorreccionDeAgente");
  }
}

export async function retirarCorreccionDeAgente(input: { agentSlug: string; correccionId: string }): Promise<Resultado<{ certificacion: EnvioCertificacion | null }>> {
  if (!z.uuid().safeParse(input.correccionId).success) return { ok: false, mensaje: "Corrección no válida." };
  try {
    const c = await contexto(input.agentSlug, { soloAdmin: true });
    if ("error" in c) return { ok: false, mensaje: c.error };
    const r = await retirarCorreccion(c.api.deps, { ...ids(c), correccionId: input.correccionId });
    return { ok: true, certificacion: r.certificacion };
  } catch (e) {
    return fallo(e, "retirarCorreccionDeAgente");
  }
}
