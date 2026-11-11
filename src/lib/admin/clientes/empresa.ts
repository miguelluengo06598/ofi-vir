/**
 * Lo que la EMPRESA hace con lo que MyOfia le prepara (SOLO SERVIDOR; las rutas de Next son envoltorios finos):
 *  - GET  /api/empresas/exportaciones              sus exportaciones de datos (propietario o admin).
 *  - GET  /api/empresas/exportaciones/[id]         descarga: redirige a un enlace firmado de 5 min (propietario o admin).
 *  - GET  /api/empresas/propietario/cambios        cambio de propietario pendiente pedido por MyOfia (propietario o admin).
 *  - POST /api/empresas/propietario/cambios/[id]   { decision: 'confirmar' | 'rechazar' } (solo el propietario actual).
 * La empresa sale de la sesión, nunca de la URL ni del cuerpo.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Sesion } from "../../empresas/sesion.ts";
import { esGestor } from "../../empresas/permisos.ts";
import { enlaceDeDescarga } from "./exportar.ts";

export type DepsEmpresaSamgple = { db: SupabaseClient; autenticar: (req: Request) => Promise<Sesion | null> };

const json = (cuerpo: unknown, status = 200) => Response.json(cuerpo, { status, headers: { "cache-control": "no-store" } });
const fallo = (status: number, error: string, mensaje: string) => json({ error, mensaje }, status);

async function gestor(req: Request, deps: DepsEmpresaSamgple): Promise<Sesion | Response> {
  const s = await deps.autenticar(req);
  if (!s) return fallo(401, "no_autenticado", "Inicia sesión para continuar.");
  if (!esGestor(s.rol)) return fallo(403, "sin_permiso", "Solo los propietarios y administradores de la empresa pueden hacer esto.");
  return s;
}

export async function exportacionesGetHandler(req: Request, deps: DepsEmpresaSamgple): Promise<Response> {
  const s = await gestor(req, deps);
  if (s instanceof Response) return s;
  const { data, error } = await deps.db.from("empresa_exportaciones").select("id, estado, tamano_bytes, creado_en, terminada_en, caduca_en, descargada_en").eq("company_id", s.companyId).order("creado_en", { ascending: false }).limit(20);
  if (error) return fallo(500, "error_interno", "No se pudieron leer las exportaciones.");
  return json({ exportaciones: (data ?? []).map((e) => ({ id: e.id, estado: e.estado, tamanoBytes: e.tamano_bytes, creadaEn: e.creado_en, terminadaEn: e.terminada_en, caducaEn: e.caduca_en, descargadaEn: e.descargada_en })) });
}

export async function exportacionDescargaHandler(req: Request, deps: DepsEmpresaSamgple, id: string): Promise<Response> {
  const s = await gestor(req, deps);
  if (s instanceof Response) return s;
  if (!z.uuid().safeParse(id).success) return fallo(404, "no_encontrado", "Esa exportación no existe.");
  try {
    const r = await enlaceDeDescarga(deps.db, s.companyId, id);
    if ("url" in r) return new Response(null, { status: 302, headers: { location: r.url, "cache-control": "no-store" } });
    if (r.error === "no_encontrada") return fallo(404, "no_encontrado", "Esa exportación no existe.");
    if (r.error === "caducada") return fallo(410, "caducada", "La exportación caducó. Pide otra a MyOfia.");
    return fallo(409, "no_lista", "La exportación todavía se está preparando.");
  } catch {
    return fallo(500, "error_interno", "No se pudo preparar la descarga.");
  }
}

export async function cambiosPropietarioGetHandler(req: Request, deps: DepsEmpresaSamgple): Promise<Response> {
  const s = await gestor(req, deps);
  if (s instanceof Response) return s;
  const { data, error } = await deps.db.from("cambios_propietario").select("id, propietario_actual, nuevo_propietario, motivo, creado_en, caduca_en")
    .eq("company_id", s.companyId).eq("estado", "pendiente").gt("caduca_en", new Date().toISOString()).maybeSingle();
  if (error) return fallo(500, "error_interno", "No se pudo leer el cambio de propietario.");
  if (!data) return json({ cambio: null });
  const { data: perfiles } = await deps.db.from("users").select("id, full_name").in("id", [data.propietario_actual, data.nuevo_propietario]);
  const nombre = (id: string) => perfiles?.find((p) => p.id === id)?.full_name ?? "—";
  return json({ cambio: { id: data.id, actual: nombre(data.propietario_actual), nuevo: nombre(data.nuevo_propietario), motivo: data.motivo, creadoEn: data.creado_en, caducaEn: data.caduca_en, puedoDecidir: s.rol === "propietario" && s.userId === data.propietario_actual } });
}

export async function cambioPropietarioPostHandler(req: Request, deps: DepsEmpresaSamgple, id: string): Promise<Response> {
  const s = await deps.autenticar(req);
  if (!s) return fallo(401, "no_autenticado", "Inicia sesión para continuar.");
  if (s.rol !== "propietario") return fallo(403, "sin_permiso", "Solo el propietario actual puede confirmar o rechazar el cambio.");
  let cuerpo: unknown;
  try { cuerpo = JSON.parse((await req.text()) || "{}"); } catch { return fallo(400, "peticion_invalida", "La petición no es válida."); }
  const v = z.object({ decision: z.enum(["confirmar", "rechazar"]) }).strict().safeParse(cuerpo);
  if (!v.success || !z.uuid().safeParse(id).success) return fallo(400, "peticion_invalida", "Indica si confirmas o rechazas.");
  const { data: c } = await deps.db.from("cambios_propietario").select("company_id, nuevo_propietario").eq("id", id).eq("company_id", s.companyId).maybeSingle();
  if (!c) return fallo(404, "no_encontrado", "Ese cambio no existe.");
  const { data, error } = await deps.db.rpc("admin_cambio_propietario_resolver", { p_cambio_id: id, p_actor: s.userId, p_via: "propietario", p_aceptar: v.data.decision === "confirmar" });
  if (error) {
    if (error.code === "42501") return fallo(403, "sin_permiso", "Solo el propietario actual puede confirmar el cambio.");
    if (/CAMBIO_NO_PENDIENTE/.test(error.message)) return fallo(409, "no_pendiente", "Ese cambio ya no está pendiente.");
    if (/NUEVO_NO_ACTIVO/.test(error.message)) return fallo(409, "nuevo_no_activo", "La nueva persona ya no es miembro activo.");
    return fallo(500, "error_interno", "No se pudo completar la operación.");
  }
  // Quién y cómo lo resolvió queda en cambios_propietario (resuelto_por, resuelto_via). No va a admin_audit_log: ese registro es
  // de acciones de MyOfia y su actor no se puede borrar, lo que impediría borrar después la cuenta de esta persona.
  return json({ estado: data, nuevoPropietario: c.nuevo_propietario });
}
