/**
 * Rutas de empresas y miembros (SOLO SERVIDOR; las de Next son envoltorios finos):
 *  - GET  /api/empresas                      mis empresas y cuál está activa.
 *  - POST /api/empresas/activa               { companyId } elige la empresa activa (cookie), solo si soy miembro activo.
 *  - GET  /api/empresas/miembros             miembros de la empresa activa (cualquier miembro).
 *  - POST /api/empresas/miembros/[userId]    { rol?, estado?, puedeAprobar? } (propietario o admin; nunca sobre el propietario).
 *  - POST /api/empresas/propietario          { userId } transfiere la propiedad (solo el propietario).
 *  - GET/POST /api/empresas/invitaciones     listar / invitar { email, rol } (propietario o admin). El enlace con el token sale UNA vez.
 *  - DELETE /api/empresas/invitaciones/[id]  revocar.
 *  - POST /api/invitaciones/aceptar          { token } la persona invitada (con su sesión) acepta.
 * La empresa sale de la sesión (empresa activa verificada), nunca del cuerpo. Toda escritura va por funciones SQL atómicas.
 */
import { createHash, randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { esGestor, NOMBRE_ROL, puede, type RolEmpresa } from "./permisos.ts";
import { COOKIE_EMPRESA_ACTIVA, membresiasDe, personasDeEmpresa, type Sesion } from "./sesion.ts";

export type DepsEmpresas = {
  db: SupabaseClient;
  autenticar: (req: Request) => Promise<Sesion | null>;
  persona: (req: Request) => Promise<string | null>;
  appUrl: string | null;
  produccion: boolean;
  enviarInvitacion?: (datos: { para: string; empresa: string; rol: "admin" | "miembro"; enlace: string }) => Promise<void>;
};

const json = (cuerpo: unknown, status = 200, extra: Record<string, string> = {}) => Response.json(cuerpo, { status, headers: { "cache-control": "no-store", ...extra } });
const fallo = (status: number, error: string, mensaje: string) => json({ error, mensaje }, status);
async function leer(req: Request): Promise<unknown> {
  const t = await req.text();
  if (!t.trim()) return {};
  try { return JSON.parse(t); } catch { return undefined; }
}
const UUID = z.uuid();
export const huellaToken = (token: string) => createHash("sha256").update(token).digest("hex");

/** Errores de las funciones SQL → respuesta (sin detalles internos). */
function deSql(e: { code?: string; message?: string }) {
  const m = e.message ?? "";
  if (e.code === "42501") return fallo(403, "sin_permiso", /PROPIETARIO_PROTEGIDO/.test(m) ? "El propietario solo cambia transfiriendo la propiedad." : /ROL_NO_PERMITIDO/.test(m) ? "Ese rol no se puede asignar así." : /DE_OTRA_PERSONA/.test(m) ? "Esta invitación es para otro correo." : "No tienes permiso para hacer esto.");
  if (e.code === "23505") return fallo(409, "ya_es_miembro", "Esa persona ya es miembro de la empresa.");
  if (e.code === "22023") return fallo(400, "no_valido", /INVITACION/.test(m) ? "La invitación no existe, ya se usó, se revocó o caducó." : "Datos no válidos.");
  if (e.code === "P0002") return fallo(404, "no_encontrado", "No existe.");
  return fallo(500, "error_interno", "No se pudo completar la operación.");
}

// ── Mis empresas y empresa activa ──────────────────────────────────────────────────────────────
export async function empresasGetHandler(req: Request, deps: DepsEmpresas): Promise<Response> {
  const userId = await deps.persona(req);
  if (!userId) return fallo(401, "no_autenticado", "Inicia sesión para continuar.");
  const [ms, sesion] = await Promise.all([membresiasDe(deps.db, userId), deps.autenticar(req)]);
  return json({ activa: sesion?.companyId ?? null, empresas: ms.map((m) => ({ id: m.companyId, nombre: m.nombre, rol: m.rol, nombreRol: NOMBRE_ROL[m.rol] })) });
}

export async function empresaActivaPostHandler(req: Request, deps: DepsEmpresas): Promise<Response> {
  const userId = await deps.persona(req);
  if (!userId) return fallo(401, "no_autenticado", "Inicia sesión para continuar.");
  const v = z.object({ companyId: UUID }).strict().safeParse(await leer(req));
  if (!v.success) return fallo(400, "peticion_invalida", "Indica la empresa.");
  // Solo una empresa de la que la persona es miembro activo: si no, «no existe» (no revela que la empresa existe).
  if (!(await membresiasDe(deps.db, userId)).some((m) => m.companyId === v.data.companyId)) return fallo(404, "no_encontrado", "Esa empresa no existe.");
  const cookie = `${COOKIE_EMPRESA_ACTIVA}=${v.data.companyId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 30}${deps.produccion ? "; Secure" : ""}`;
  return json({ activa: v.data.companyId }, 200, { "set-cookie": cookie });
}

// ── Miembros ────────────────────────────────────────────────────────────────────────────────────
export async function miembrosGetHandler(req: Request, deps: DepsEmpresas): Promise<Response> {
  const s = await deps.autenticar(req);
  if (!s) return fallo(401, "no_autenticado", "Inicia sesión para continuar.");
  const [{ data, error }, nombres] = await Promise.all([
    deps.db.from("company_members").select("user_id, rol, estado, puede_aprobar, creado_en").eq("company_id", s.companyId).order("creado_en"),
    personasDeEmpresa(deps.db, s.companyId),
  ]);
  if (error) return fallo(500, "error_interno", "No se pudieron leer los miembros.");
  return json({
    yo: { userId: s.userId, rol: s.rol, gestiona: esGestor(s.rol) },
    miembros: (data ?? []).map((m) => ({ userId: m.user_id, nombre: nombres.get(m.user_id as string) ?? "—", rol: m.rol, estado: m.estado, puedeAprobar: m.puede_aprobar, desde: m.creado_en })),
  });
}

const CambioMiembro = z.object({
  rol: z.enum(["admin", "miembro"]).optional(), estado: z.enum(["activo", "desactivado"]).optional(), puedeAprobar: z.boolean().optional(),
}).strict().refine((x) => x.rol !== undefined || x.estado !== undefined || x.puedeAprobar !== undefined, { message: "Nada que cambiar." });
export async function miembroPostHandler(req: Request, userId: string, deps: DepsEmpresas): Promise<Response> {
  const s = await deps.autenticar(req);
  if (!s) return fallo(401, "no_autenticado", "Inicia sesión para continuar.");
  if (!puede(s.rol, "gestionar_miembros")) return fallo(403, "sin_permiso", "Solo propietarios y administradores gestionan miembros.");
  if (!UUID.safeParse(userId).success) return fallo(404, "no_encontrado", "Ese miembro no existe.");
  const v = CambioMiembro.safeParse(await leer(req));
  if (!v.success) return fallo(400, "peticion_invalida", "La petición no es válida.");
  const { error } = await deps.db.rpc("miembro_actualizar", {
    p_company_id: s.companyId, p_actor: s.userId, p_user_id: userId, p_rol: v.data.rol ?? null, p_estado: v.data.estado ?? null, p_puede_aprobar: v.data.puedeAprobar ?? null,
  });
  return error ? deSql(error) : json({ ok: true });
}

export async function propietarioPostHandler(req: Request, deps: DepsEmpresas): Promise<Response> {
  const s = await deps.autenticar(req);
  if (!s) return fallo(401, "no_autenticado", "Inicia sesión para continuar.");
  if (!puede(s.rol, "transferir_propiedad")) return fallo(403, "sin_permiso", "Solo el propietario puede transferir la propiedad.");
  const v = z.object({ userId: UUID }).strict().safeParse(await leer(req));
  if (!v.success) return fallo(400, "peticion_invalida", "Indica la persona.");
  const { error } = await deps.db.rpc("propiedad_transferir", { p_company_id: s.companyId, p_actor: s.userId, p_nuevo: v.data.userId });
  return error ? deSql(error) : json({ ok: true });
}

// ── Invitaciones ────────────────────────────────────────────────────────────────────────────────
export async function invitacionesGetHandler(req: Request, deps: DepsEmpresas): Promise<Response> {
  const s = await deps.autenticar(req);
  if (!s) return fallo(401, "no_autenticado", "Inicia sesión para continuar.");
  if (!puede(s.rol, "gestionar_miembros")) return fallo(403, "sin_permiso", "Solo propietarios y administradores ven las invitaciones.");
  const { data, error } = await deps.db.from("company_invitations").select("id, email, rol, creado_en, caduca_en, aceptada_en, revocada_en")
    .eq("company_id", s.companyId).order("creado_en", { ascending: false }).limit(100);
  return error ? fallo(500, "error_interno", "No se pudieron leer las invitaciones.") : json({ invitaciones: data ?? [] });
}

export async function invitacionesPostHandler(req: Request, deps: DepsEmpresas): Promise<Response> {
  const s = await deps.autenticar(req);
  if (!s) return fallo(401, "no_autenticado", "Inicia sesión para continuar.");
  if (!puede(s.rol, "gestionar_miembros")) return fallo(403, "sin_permiso", "Solo propietarios y administradores invitan.");
  if (!deps.appUrl || !deps.enviarInvitacion) return fallo(503, "correo_sin_configurar", "No se pueden enviar invitaciones hasta configurar la URL pública y Resend.");
  const v = z.object({ email: z.email().max(254), rol: z.enum(["admin", "miembro"]) }).strict().safeParse(await leer(req));
  if (!v.success) return fallo(400, "peticion_invalida", "Indica un correo válido y el rol (admin o miembro).");
  // Token aleatorio de 32 bytes: se entrega una sola vez; la base solo guarda su huella.
  const token = randomBytes(32).toString("base64url");
  const { data, error } = await deps.db.rpc("invitacion_crear", { p_company_id: s.companyId, p_actor: s.userId, p_email: v.data.email, p_rol: v.data.rol, p_token_hash: huellaToken(token) });
  if (error) return deSql(error);
  const enlace = `${deps.appUrl}/invitacion/${token}`;
  try {
    const { data: empresa } = await deps.db.from("companies").select("name").eq("id", s.companyId).single();
    await deps.enviarInvitacion({ para: v.data.email.toLowerCase(), empresa: empresa?.name ?? "tu oficina", rol: v.data.rol, enlace });
  } catch (e) {
    console.error("No se pudo enviar la invitación", e instanceof Error ? e.message : e);
    return fallo(502, "correo_no_enviado", "La invitación no se ha podido enviar. Revócala y vuelve a intentarlo.");
  }
  return json({ id: data, email: v.data.email.toLowerCase(), rol: v.data.rol, caducaEnDias: 7, token, enlace, enviada: true }, 201);
}

export async function invitacionDeleteHandler(req: Request, id: string, deps: DepsEmpresas): Promise<Response> {
  const s = await deps.autenticar(req);
  if (!s) return fallo(401, "no_autenticado", "Inicia sesión para continuar.");
  if (!puede(s.rol, "gestionar_miembros")) return fallo(403, "sin_permiso", "Solo propietarios y administradores revocan invitaciones.");
  if (!UUID.safeParse(id).success) return fallo(404, "no_encontrado", "Esa invitación no existe.");
  const { error } = await deps.db.from("company_invitations").update({ revocada_en: new Date().toISOString() }).eq("company_id", s.companyId).eq("id", id).is("aceptada_en", null);
  return error ? fallo(500, "error_interno", "No se pudo revocar.") : json({ revocada: true });
}

export async function aceptarInvitacionHandler(req: Request, deps: DepsEmpresas): Promise<Response> {
  const userId = await deps.persona(req);
  if (!userId) return fallo(401, "no_autenticado", "Inicia sesión con el correo invitado para aceptar.");
  const v = z.object({ token: z.string().min(20).max(200) }).strict().safeParse(await leer(req));
  if (!v.success) return fallo(400, "peticion_invalida", "Falta el token de la invitación.");
  const { data, error } = await deps.db.rpc("invitacion_aceptar", { p_token_hash: huellaToken(v.data.token), p_user_id: userId });
  return error ? deSql(error) : json({ companyId: data });
}

export type { RolEmpresa };
