/**
 * «Puesta en marcha» en la oficina del cliente (SOLO SERVIDOR; las rutas de Next son envoltorios finos):
 *  - GET  /api/puesta-en-marcha                 progreso y tareas del cliente (cualquier miembro).
 *  - POST /api/puesta-en-marcha/[id]            { hecha: true } marca una tarea manual del cliente (propietario o admin).
 *  - GET/POST /api/empresas/datos-fiscales      los datos fiscales de la empresa (leer: propietario o admin; guardar: igual).
 * La empresa sale siempre de la sesión. Las reglas (dependencias, qué puede marcar el cliente) las vuelve a imponer la base.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Sesion } from "../../empresas/sesion.ts";
import { esGestor } from "../../empresas/permisos.ts";
import { implantacionDeEmpresa } from "./servicio.ts";

export type DepsPuesta = { db: SupabaseClient; autenticar: (req: Request) => Promise<Sesion | null>; ahora?: () => Date };

const json = (cuerpo: unknown, status = 200) => Response.json(cuerpo, { status, headers: { "cache-control": "no-store" } });
const fallo = (status: number, error: string, mensaje: string) => json({ error, mensaje }, status);
async function leer(req: Request): Promise<unknown> {
  try { return JSON.parse((await req.text()) || "{}"); } catch { return undefined; }
}

export async function puestaGetHandler(req: Request, deps: DepsPuesta): Promise<Response> {
  const s = await deps.autenticar(req);
  if (!s) return fallo(401, "no_autenticado", "Inicia sesión para continuar.");
  try {
    const impl = await implantacionDeEmpresa(deps.db, s.companyId, deps.ahora?.());
    if (!impl) return json({ implantacion: null });
    const visibles = impl.tareas.filter((t) => t.estado !== "descartada");
    const hechas = visibles.filter((t) => t.estado === "hecha").length;
    const gestor = esGestor(s.rol);
    return json({
      implantacion: {
        estado: impl.estado, objetivoFin: impl.objetivoFin, completadaEn: impl.completadaEn, responsable: impl.responsable?.nombre ?? null,
        total: visibles.length, hechas, progreso: visibles.length ? Math.round((hechas / visibles.length) * 100) : 0,
        // Lo de SAMGPLE se resume (cuántas quedan y la próxima), sin detalles internos de su equipo.
        samgple: { pendientes: visibles.filter((t) => t.para === "samgple" && t.estado !== "hecha").length, proxima: visibles.find((t) => t.para === "samgple" && t.estado !== "hecha")?.titulo ?? null },
      },
      tareas: visibles.filter((t) => t.para === "cliente").map((t) => ({
        id: t.id, titulo: t.titulo, ayuda: t.ayuda, estado: t.estado, obligatoria: t.obligatoria, venceEn: t.venceEn, hechaEn: t.hechaEn, atrasada: t.atrasada,
        accion: t.accion, agentId: t.agentId, automatica: t.comprobacion !== null, bloqueada: t.bloqueada,
        esperaA: t.dependeDe.filter((d) => !d.hecha).map((d) => d.titulo),
        // Solo se marcan a mano las tareas sin comprobación automática, y solo un propietario o admin.
        puedoMarcar: gestor && t.comprobacion === null && t.estado !== "hecha" && !t.bloqueada,
      })),
      puedoGestionar: gestor,
    });
  } catch {
    return fallo(500, "error_interno", "No se pudo cargar la puesta en marcha.");
  }
}

export async function puestaPostHandler(req: Request, deps: DepsPuesta, id: string): Promise<Response> {
  const s = await deps.autenticar(req);
  if (!s) return fallo(401, "no_autenticado", "Inicia sesión para continuar.");
  if (!esGestor(s.rol)) return fallo(403, "sin_permiso", "Solo los propietarios y administradores marcan tareas.");
  const v = z.object({ hecha: z.literal(true) }).strict().safeParse(await leer(req));
  if (!v.success || !z.uuid().safeParse(id).success) return fallo(400, "peticion_invalida", "La petición no es válida.");
  // La tarea tiene que ser de la empresa de la sesión: si no, «no existe».
  const { data: t } = await deps.db.from("implantacion_tareas").select("id, implantaciones!inner(company_id)").eq("id", id).eq("implantaciones.company_id", s.companyId).maybeSingle();
  if (!t) return fallo(404, "no_encontrado", "Esa tarea no existe.");
  const { data, error } = await deps.db.rpc("implantacion_tarea_actualizar", { p_tarea_id: id, p_actor: s.userId, p_via: "cliente", p_estado: "hecha" });
  if (error) {
    const m = error.message ?? "";
    if (/DEPENDENCIAS_PENDIENTES/.test(m)) return fallo(409, "esperando", m.replace(/^DEPENDENCIAS_PENDIENTES: /, "").replace(/^./, (c) => c.toUpperCase()) + ".");
    if (error.code === "42501") return fallo(403, "sin_permiso", "Esta tarea se marca sola cuando está hecha.");
    return fallo(500, "error_interno", "No se pudo marcar la tarea.");
  }
  return json({ ok: true, resultado: data });
}

// ── Datos fiscales (el cliente los completa en su oficina) ──────────────────────────────────────
export const DatosFiscalesSchema = z.object({
  razonSocial: z.string().trim().min(2, "Escribe la razón social.").max(200),
  nif: z.string().trim().toUpperCase().transform((x) => x.replace(/[\s.-]/g, "")).pipe(z.string().regex(/^[A-Z0-9]{8,12}$/, "El NIF/CIF no es válido.")),
  direccion: z.string().trim().min(3, "Escribe la dirección.").max(300),
  codigoPostal: z.string().trim().toUpperCase().regex(/^[0-9A-Z -]{3,10}$/, "El código postal no es válido."),
  ciudad: z.string().trim().min(1, "Escribe la ciudad.").max(120),
  provincia: z.string().trim().max(120).optional().transform((x) => x || null),
  pais: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, "El país va en código de dos letras (ES)."),
  emailFacturacion: z.email("El correo de facturación no es válido.").max(254),
}).strict();

export async function fiscalesGetHandler(req: Request, deps: DepsPuesta): Promise<Response> {
  const s = await deps.autenticar(req);
  if (!s) return fallo(401, "no_autenticado", "Inicia sesión para continuar.");
  if (!esGestor(s.rol)) return fallo(403, "sin_permiso", "Solo los propietarios y administradores ven los datos fiscales.");
  const { data, error } = await deps.db.from("empresa_datos_fiscales").select("razon_social, nif, direccion, codigo_postal, ciudad, provincia, pais, email_facturacion").eq("company_id", s.companyId).maybeSingle();
  if (error) return fallo(500, "error_interno", "No se pudieron leer los datos fiscales.");
  return json({ datos: data ? { razonSocial: data.razon_social, nif: data.nif, direccion: data.direccion, codigoPostal: data.codigo_postal, ciudad: data.ciudad, provincia: data.provincia, pais: data.pais, emailFacturacion: data.email_facturacion } : null });
}

export async function fiscalesPostHandler(req: Request, deps: DepsPuesta): Promise<Response> {
  const s = await deps.autenticar(req);
  if (!s) return fallo(401, "no_autenticado", "Inicia sesión para continuar.");
  if (!esGestor(s.rol)) return fallo(403, "sin_permiso", "Solo los propietarios y administradores cambian los datos fiscales.");
  const v = DatosFiscalesSchema.safeParse(await leer(req));
  if (!v.success) return fallo(400, "peticion_invalida", v.error.issues[0]?.message ?? "Revisa los datos.");
  const d = v.data;
  const { error } = await deps.db.from("empresa_datos_fiscales").upsert({
    company_id: s.companyId, razon_social: d.razonSocial, nif: d.nif, direccion: d.direccion, codigo_postal: d.codigoPostal, ciudad: d.ciudad,
    provincia: d.provincia, pais: d.pais, email_facturacion: d.emailFacturacion.toLowerCase(), actualizado_en: new Date().toISOString(), actualizado_por: s.userId,
  });
  if (error) return fallo(500, "error_interno", "No se pudieron guardar los datos fiscales.");
  return json({ ok: true });
}
