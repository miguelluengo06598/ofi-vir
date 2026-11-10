/**
 * Tablero comercial: solicitudes de acceso, su ficha, notas y próximas acciones. SOLO SERVIDOR (clave de servicio).
 * Las acciones que cambian algo quedan en admin_audit_log.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { registrarAuditoria } from "@/lib/admin/acceso";
import { ESTADOS_MOVIBLES, type EstadoSolicitud } from "./config";

export type Solicitud = {
  id: string; nombre: string; email: string; empresa: string | null; telefono: string | null; sector: string | null; tamano: string | null;
  web: string | null; mensaje: string | null; aceptaComunicaciones: boolean; aceptaPrivacidad: boolean; estado: EstadoSolicitud;
  origen: string; creadoEn: string; companyId: string | null; proximaAccion: { texto: string; venceEn: string } | null; notas: number;
};
export type NotaSolicitud = { id: string; texto: string; autor: string | null; creadoEn: string };
export type AccionSolicitud = { id: string; texto: string; venceEn: string; responsable: string | null; responsableId: string | null; hechaEn: string | null };
export type PersonaSamgple = { userId: string; nombre: string };

const fila = (r: Record<string, unknown>): Omit<Solicitud, "proximaAccion" | "notas"> => ({
  id: r.id as string, nombre: r.nombre as string, email: r.email as string, empresa: (r.empresa as string) ?? null, telefono: (r.telefono as string) ?? null,
  sector: (r.sector as string) ?? null, tamano: (r.tamano as string) ?? null, web: (r.web as string) ?? null, mensaje: (r.mensaje as string) ?? null,
  aceptaComunicaciones: r.acepta_comunicaciones === true, aceptaPrivacidad: r.acepta_privacidad === true, estado: r.estado as EstadoSolicitud,
  origen: r.origen as string, creadoEn: r.creado_en as string, companyId: (r.company_id as string) ?? null,
});

export async function equipoSamgple(db: SupabaseClient): Promise<PersonaSamgple[]> {
  const { data, error } = await db.from("platform_roles").select("user_id, nombre").eq("activo", true).order("nombre");
  if (error) throw new Error("No se pudo leer el equipo de SAMGPLE.");
  return (data ?? []).map((r) => ({ userId: r.user_id as string, nombre: (r.nombre as string | null) ?? "Equipo SAMGPLE" }));
}

export async function listarSolicitudes(db: SupabaseClient): Promise<Solicitud[]> {
  const [{ data: sol, error }, { data: acc }, { data: notas }] = await Promise.all([
    db.from("solicitudes_acceso").select("*").order("creado_en", { ascending: false }).limit(500),
    db.from("solicitud_acciones").select("solicitud_id, texto, vence_en").is("hecha_en", null).order("vence_en"),
    db.from("solicitud_notas").select("solicitud_id"),
  ]);
  if (error) throw new Error("No se pudieron leer las solicitudes.");
  const proxima = new Map<string, { texto: string; venceEn: string }>();
  for (const a of acc ?? []) if (!proxima.has(a.solicitud_id as string)) proxima.set(a.solicitud_id as string, { texto: a.texto as string, venceEn: a.vence_en as string });
  const cuentas = new Map<string, number>();
  for (const n of notas ?? []) cuentas.set(n.solicitud_id as string, (cuentas.get(n.solicitud_id as string) ?? 0) + 1);
  return (sol ?? []).map((r) => ({ ...fila(r), proximaAccion: proxima.get(r.id as string) ?? null, notas: cuentas.get(r.id as string) ?? 0 }));
}

export async function fichaSolicitud(db: SupabaseClient, id: string) {
  const [{ data: s }, { data: notas }, { data: acciones }, { data: demos }, equipo] = await Promise.all([
    db.from("solicitudes_acceso").select("*").eq("id", id).maybeSingle(),
    db.from("solicitud_notas").select("id, texto, autor_id, creado_en").eq("solicitud_id", id).order("creado_en", { ascending: false }),
    db.from("solicitud_acciones").select("id, texto, vence_en, responsable, hecha_en").eq("solicitud_id", id).order("vence_en"),
    db.from("demos").select("id, fecha, estado").eq("solicitud_id", id).order("fecha"),
    equipoSamgple(db),
  ]);
  if (!s) return null;
  const nombre = (uid: string | null) => (uid ? equipo.find((p) => p.userId === uid)?.nombre ?? "Equipo SAMGPLE" : null);
  return {
    solicitud: fila(s),
    notas: (notas ?? []).map((n): NotaSolicitud => ({ id: n.id as string, texto: n.texto as string, autor: nombre(n.autor_id as string | null), creadoEn: n.creado_en as string })),
    acciones: (acciones ?? []).map((a): AccionSolicitud => ({ id: a.id as string, texto: a.texto as string, venceEn: a.vence_en as string, responsable: nombre(a.responsable as string | null), responsableId: (a.responsable as string) ?? null, hechaEn: (a.hecha_en as string) ?? null })),
    demos: (demos ?? []).map((d) => ({ id: d.id as string, fecha: d.fecha as string, estado: d.estado as string })),
    equipo,
  };
}
export type FichaSolicitud = NonNullable<Awaited<ReturnType<typeof fichaSolicitud>>>;

export async function moverSolicitud(db: SupabaseClient, actor: string, id: string, estado: EstadoSolicitud): Promise<void> {
  if (!ESTADOS_MOVIBLES.includes(estado)) throw new Error("A «Cliente» solo se llega dando de alta.");
  const { data: antes } = await db.from("solicitudes_acceso").select("estado").eq("id", id).maybeSingle();
  if (!antes) throw new Error("La solicitud no existe.");
  if (antes.estado === "cliente") throw new Error("Una solicitud que ya es cliente no se mueve.");
  const { error } = await db.from("solicitudes_acceso").update({ estado, actualizado_en: new Date().toISOString() }).eq("id", id);
  if (error) throw new Error("No se pudo mover la solicitud.");
  await registrarAuditoria(db, { actorId: actor, accion: "solicitud_mover", objetoTipo: "solicitud", objetoId: id, antes: { estado: antes.estado }, despues: { estado } });
}

export async function anadirNota(db: SupabaseClient, actor: string, id: string, texto: string): Promise<void> {
  const { error } = await db.from("solicitud_notas").insert({ solicitud_id: id, autor_id: actor, texto: texto.trim() });
  if (error) throw new Error("No se pudo guardar la nota.");
}

export async function anadirAccion(db: SupabaseClient, actor: string, id: string, a: { texto: string; venceEn: string; responsable: string }): Promise<void> {
  const { error } = await db.from("solicitud_acciones").insert({ solicitud_id: id, texto: a.texto.trim(), vence_en: a.venceEn, responsable: a.responsable, creado_por: actor });
  if (error) throw new Error("No se pudo guardar la acción.");
}

export async function completarAccion(db: SupabaseClient, accionId: string): Promise<void> {
  const { error } = await db.from("solicitud_acciones").update({ hecha_en: new Date().toISOString() }).eq("id", accionId).is("hecha_en", null);
  if (error) throw new Error("No se pudo marcar la acción.");
}
