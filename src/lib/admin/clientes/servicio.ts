/**
 * Acciones de SAMGPLE sobre un cliente. Cada una: 1) vuelve a comprobar el rol de plataforma (`puedeHacer`), 2) valida con zod
 * estricto (motivo obligatorio), 3) hace el cambio con una función SQL atómica cuando toca dinero, estado o propiedad, y
 * 4) lo anota en `admin_audit_log` (antes/después y motivo). Solo servidor; las acciones de servidor son envoltorios finos.
 */
import { createHash, randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { registrarAuditoria, type SesionPlataforma } from "../acceso.ts";
import { LIMITES_CREDITOS, MOTIVOS_IDS, puedeHacer, SERVICIOS_IDS, type AccionCliente } from "./config.ts";
import { BUCKET_EXPORTACIONES } from "./exportar.ts";

export class ClienteError extends Error {}
export type Contexto = { db: SupabaseClient; sesion: SesionPlataforma; ip: string | null; ahora?: () => Date };

const Uuid = z.uuid();
const Motivo = z.string().trim().min(3, "Escribe el motivo (al menos 3 caracteres).").max(1000);

function exigir(ctx: Contexto, accion: AccionCliente) {
  if (!puedeHacer(ctx.sesion.roles, accion)) throw new ClienteError("Tu rol no permite esta acción.");
}
function validar<T extends z.ZodType>(schema: T, input: unknown): z.infer<T> {
  const v = schema.safeParse(input);
  if (!v.success) throw new ClienteError(v.error.issues[0]?.message ?? "Datos no válidos.");
  return v.data;
}
async function empresaViva(db: SupabaseClient, companyId: string) {
  const { data } = await db.from("companies").select("id, name, estado").eq("id", companyId).eq("es_examen", false).maybeSingle();
  if (!data) throw new ClienteError("Esa empresa no existe.");
  if (data.estado === "borrada") throw new ClienteError("La empresa está borrada: ya no admite cambios.");
  return data as { id: string; name: string; estado: string };
}
const auditar = (ctx: Contexto, e: { accion: string; companyId: string; objetoTipo?: string; objetoId?: string; antes?: unknown; despues?: unknown; motivo?: string | null }) =>
  registrarAuditoria(ctx.db, { actorId: ctx.sesion.userId, ip: ctx.ip, ...e });
/** Mensaje legible de un error de una función SQL (sin detalles internos). */
function deSql(e: { code?: string; message?: string }, porDefecto: string): ClienteError {
  const m = e.message ?? "";
  if (/SALDO_INSUFICIENTE/.test(m)) return new ClienteError("No hay saldo suficiente para retirar esos créditos.");
  if (/NOMBRE_NO_COINCIDE/.test(m)) return new ClienteError("El nombre escrito no coincide exactamente con el de la empresa.");
  if (/YA_SUSPENDIDA/.test(m)) return new ClienteError("La empresa ya está suspendida (la suspensión ya pausa sus agentes).");
  if (/NADA_QUE_REACTIVAR/.test(m)) return new ClienteError("La empresa ya está activa.");
  if (/NUEVO_NO_ACTIVO/.test(m)) return new ClienteError("La nueva persona propietaria debe ser un miembro activo.");
  if (/PROPIETARIO_CAMBIADO/.test(m)) return new ClienteError("El propietario cambió mientras tanto. Pide el cambio de nuevo.");
  if (/CAMBIO_NO_PENDIENTE/.test(m)) return new ClienteError("Ese cambio ya no está pendiente.");
  if (/INVITACION_NO_REENVIABLE/.test(m)) return new ClienteError("Esa invitación ya se aceptó.");
  if (/YA_HAY_PROPIETARIO/.test(m)) return new ClienteError("La empresa ya tiene propietario: esa invitación de propietario ya no vale. Invita como administrador.");
  if (/EMPRESA_NO_ACTIVA/.test(m)) return new ClienteError("La empresa no está activa: no se pueden enviar invitaciones.");
  if (e.code === "42501") return new ClienteError("Tu rol no permite esta acción.");
  if (e.code === "P0002") return new ClienteError("Esa empresa no existe.");
  console.error("[admin/clientes]", e.code ?? "sin código");
  return new ClienteError(porDefecto);
}

// ── Ficha: responsable, servicios y notas ───────────────────────────────────────────────────────
const FichaSchema = z.object({ companyId: Uuid, responsable: Uuid.nullable(), servicios: z.array(z.enum(SERVICIOS_IDS)).max(SERVICIOS_IDS.length) }).strict();
export async function guardarFicha(ctx: Contexto, input: unknown) {
  exigir(ctx, "editarFicha");
  const v = validar(FichaSchema, input);
  await empresaViva(ctx.db, v.companyId);
  if (v.responsable) {
    const { data } = await ctx.db.from("platform_roles").select("user_id").eq("user_id", v.responsable).eq("activo", true).maybeSingle();
    if (!data) throw new ClienteError("El responsable debe ser una persona activa de SAMGPLE.");
  }
  const { data: antes } = await ctx.db.from("cliente_ficha").select("responsable, servicios").eq("company_id", v.companyId).maybeSingle();
  const despues = { responsable: v.responsable, servicios: [...new Set(v.servicios)] };
  const { error } = await ctx.db.from("cliente_ficha").upsert({ company_id: v.companyId, ...despues, actualizado_en: (ctx.ahora?.() ?? new Date()).toISOString(), actualizado_por: ctx.sesion.userId });
  if (error) throw deSql(error, "No se pudo guardar la ficha.");
  await auditar(ctx, { accion: "cliente.ficha", companyId: v.companyId, objetoTipo: "cliente_ficha", objetoId: v.companyId, antes, despues });
}

const NotaSchema = z.object({ companyId: Uuid, texto: z.string().trim().min(1, "Escribe la nota.").max(4000) }).strict();
export async function anotar(ctx: Contexto, input: unknown) {
  exigir(ctx, "anotar");
  const v = validar(NotaSchema, input);
  await empresaViva(ctx.db, v.companyId);
  const { data, error } = await ctx.db.from("cliente_notas").insert({ company_id: v.companyId, autor_id: ctx.sesion.userId, texto: v.texto }).select("id").single();
  if (error) throw deSql(error, "No se pudo guardar la nota.");
  // La auditoría anota que hubo una nota, no su texto (ya está en cliente_notas).
  await auditar(ctx, { accion: "cliente.nota", companyId: v.companyId, objetoTipo: "cliente_nota", objetoId: data.id });
}

// ── Datos fiscales ──────────────────────────────────────────────────────────────────────────────
const FiscalesSchema = z.object({
  companyId: Uuid,
  razonSocial: z.string().trim().min(2, "Escribe la razón social.").max(200),
  nif: z.string().trim().toUpperCase().transform((s) => s.replace(/[\s.-]/g, "")).pipe(z.string().regex(/^[A-Z0-9]{8,12}$/, "El NIF/CIF no es válido.")),
  direccion: z.string().trim().min(3, "Escribe la dirección.").max(300),
  codigoPostal: z.string().trim().toUpperCase().regex(/^[0-9A-Z -]{3,10}$/, "El código postal no es válido."),
  ciudad: z.string().trim().min(1, "Escribe la ciudad.").max(120),
  provincia: z.string().trim().max(120).optional().transform((s) => s || null),
  pais: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, "El país va en código de dos letras (ES)."),
  emailFacturacion: z.email("El correo de facturación no es válido.").max(254),
  motivo: Motivo,
}).strict();
export async function guardarFiscales(ctx: Contexto, input: unknown) {
  exigir(ctx, "editarFiscales");
  const v = validar(FiscalesSchema, input);
  await empresaViva(ctx.db, v.companyId);
  const { data: antes } = await ctx.db.from("empresa_datos_fiscales").select("razon_social, nif, direccion, codigo_postal, ciudad, provincia, pais, email_facturacion").eq("company_id", v.companyId).maybeSingle();
  const despues = { razon_social: v.razonSocial, nif: v.nif, direccion: v.direccion, codigo_postal: v.codigoPostal, ciudad: v.ciudad, provincia: v.provincia, pais: v.pais, email_facturacion: v.emailFacturacion.toLowerCase() };
  const { error } = await ctx.db.from("empresa_datos_fiscales").upsert({ company_id: v.companyId, ...despues, actualizado_en: (ctx.ahora?.() ?? new Date()).toISOString(), actualizado_por: ctx.sesion.userId });
  if (error) throw deSql(error, "No se pudieron guardar los datos fiscales.");
  await auditar(ctx, { accion: "cliente.datos_fiscales", companyId: v.companyId, objetoTipo: "empresa_datos_fiscales", objetoId: v.companyId, antes, despues, motivo: v.motivo });
}

// ── Miembros: reenviar invitación y cambio de propietario ───────────────────────────────────────
const ReenvioSchema = z.object({ companyId: Uuid, invitacionId: Uuid, motivo: Motivo }).strict();
export async function reenviarInvitacion(
  ctx: Contexto, input: unknown,
  o: { appUrl: string | null; enviar?: (d: { para: string; empresa: string; rol: "admin" | "miembro"; enlace: string }) => Promise<void> },
): Promise<{ enlace: string | null; enviado: boolean }> {
  exigir(ctx, "reenviarInvitacion");
  const v = validar(ReenvioSchema, input);
  const empresa = await empresaViva(ctx.db, v.companyId);
  const { data: inv } = await ctx.db.from("company_invitations").select("id, email, rol").eq("id", v.invitacionId).eq("company_id", v.companyId).maybeSingle();
  if (!inv) throw new ClienteError("Esa invitación no existe.");
  const token = randomBytes(32).toString("base64url");
  const { data: nuevaId, error } = await ctx.db.rpc("admin_invitacion_reenviar", { p_invitacion_id: v.invitacionId, p_actor: ctx.sesion.userId, p_token_hash: createHash("sha256").update(token).digest("hex") });
  if (error) throw deSql(error, "No se pudo reenviar la invitación.");
  const enlace = o.appUrl ? `${o.appUrl}/invitacion/${token}` : `/invitacion/${token}`;
  let enviado = false;
  if (o.enviar) {
    try { await o.enviar({ para: inv.email, empresa: empresa.name, rol: inv.rol === "admin" ? "admin" : "miembro", enlace }); enviado = true; }
    catch { console.error("[admin/clientes] no se pudo enviar el correo de la invitación reenviada"); }
  }
  await auditar(ctx, { accion: "cliente.invitacion_reenviar", companyId: v.companyId, objetoTipo: "invitacion", objetoId: nuevaId as string, antes: { invitacion: v.invitacionId }, despues: { invitacion: nuevaId, email: inv.email, rol: inv.rol, correo_enviado: enviado }, motivo: v.motivo });
  // El enlace solo se devuelve si no se pudo enviar por correo (para entregarlo a mano una vez).
  return { enlace: enviado ? null : enlace, enviado };
}

const CambioSchema = z.object({ companyId: Uuid, nuevoUserId: Uuid, motivo: Motivo, confirmarAhora: z.boolean() }).strict();
/**
 * Pide el cambio de propietario. Queda pendiente hasta que lo confirme el propietario actual (en su oficina) o un admin_samgple.
 * Si quien lo pide es admin_samgple y marca «confirmar ahora» (segunda confirmación en el diálogo), se aplica en el acto.
 */
export async function pedirCambioPropietario(ctx: Contexto, input: unknown): Promise<{ estado: string; cambioId: string }> {
  exigir(ctx, "pedirCambioPropietario");
  const v = validar(CambioSchema, input);
  await empresaViva(ctx.db, v.companyId);
  const { data: actual } = await ctx.db.from("company_members").select("user_id").eq("company_id", v.companyId).eq("rol", "propietario").neq("estado", "desactivado").maybeSingle();
  if (!actual) throw new ClienteError("La empresa no tiene propietario activo.");
  if (actual.user_id === v.nuevoUserId) throw new ClienteError("Esa persona ya es la propietaria.");
  const { data: nuevo } = await ctx.db.from("company_members").select("user_id").eq("company_id", v.companyId).eq("user_id", v.nuevoUserId).eq("estado", "activo").maybeSingle();
  if (!nuevo) throw new ClienteError("La nueva persona propietaria debe ser un miembro activo.");
  await ctx.db.from("cambios_propietario").update({ estado: "caducado", resuelto_en: new Date().toISOString() }).eq("company_id", v.companyId).eq("estado", "pendiente").lt("caduca_en", new Date().toISOString());
  const { data: cambio, error } = await ctx.db.from("cambios_propietario").insert({ company_id: v.companyId, propietario_actual: actual.user_id, nuevo_propietario: v.nuevoUserId, solicitado_por: ctx.sesion.userId, motivo: v.motivo }).select("id").single();
  if (error) throw error.code === "23505" ? new ClienteError("Ya hay un cambio de propietario pendiente en esta empresa.") : deSql(error, "No se pudo pedir el cambio.");
  await auditar(ctx, { accion: "cliente.propietario_pedir", companyId: v.companyId, objetoTipo: "cambio_propietario", objetoId: cambio.id, antes: { propietario: actual.user_id }, despues: { nuevo: v.nuevoUserId }, motivo: v.motivo });
  if (v.confirmarAhora && ctx.sesion.roles.includes("admin_samgple")) {
    const estado = await resolverCambioPropietario(ctx, { cambioId: cambio.id, aceptar: true, motivo: v.motivo });
    return { estado, cambioId: cambio.id };
  }
  await ctx.db.from("notifications").insert({
    company_id: v.companyId, tipo: "cambio_propietario", titulo: "Confirma el cambio de propietario",
    cuerpo: "SAMGPLE ha pedido transferir la propiedad de la empresa. El propietario actual debe confirmarlo o rechazarlo en Miembros (caduca en 7 días).",
    metadatos: { cambio_id: cambio.id },
  });
  return { estado: "pendiente", cambioId: cambio.id };
}

const ResolverSchema = z.object({ cambioId: Uuid, aceptar: z.boolean(), motivo: Motivo }).strict();
/** Confirmación (o rechazo) de un admin_samgple desde el panel. */
export async function resolverCambioPropietario(ctx: Contexto, input: unknown): Promise<string> {
  if (!ctx.sesion.roles.includes("admin_samgple")) throw new ClienteError("Solo admin_samgple confirma un cambio de propietario desde SAMGPLE.");
  const v = validar(ResolverSchema, input);
  const { data: c } = await ctx.db.from("cambios_propietario").select("company_id, propietario_actual, nuevo_propietario").eq("id", v.cambioId).maybeSingle();
  if (!c) throw new ClienteError("Ese cambio no existe.");
  const { data, error } = await ctx.db.rpc("admin_cambio_propietario_resolver", { p_cambio_id: v.cambioId, p_actor: ctx.sesion.userId, p_via: "admin_samgple", p_aceptar: v.aceptar });
  if (error) throw deSql(error, "No se pudo resolver el cambio.");
  await auditar(ctx, { accion: v.aceptar ? "cliente.propietario_confirmar" : "cliente.propietario_rechazar", companyId: c.company_id, objetoTipo: "cambio_propietario", objetoId: v.cambioId, antes: { propietario: c.propietario_actual }, despues: { resultado: data, nuevo: c.nuevo_propietario }, motivo: v.motivo });
  return data as string;
}

// ── Créditos: regalo o ajuste ───────────────────────────────────────────────────────────────────
const CreditosSchema = z.object({
  companyId: Uuid,
  tipo: z.enum(["regalo", "ajuste"]),
  creditos: z.number().int("Los créditos son enteros.").refine((n) => n !== 0, "Indica cuántos créditos.").refine((n) => Math.abs(n) <= LIMITES_CREDITOS.maximoPorOperacion, `Como mucho ${LIMITES_CREDITOS.maximoPorOperacion.toLocaleString("es-ES")} créditos por operación.`),
  diasCaducidad: z.number().int().min(1).max(LIMITES_CREDITOS.diasMaximo).default(LIMITES_CREDITOS.diasPorDefecto),
  motivo: Motivo,
  // Clave de idempotencia generada por el diálogo: un doble clic no regala dos veces.
  clave: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/),
}).strict().refine((v) => v.tipo === "ajuste" || v.creditos > 0, { message: "Un regalo siempre suma créditos.", path: ["creditos"] });
export async function ajustarCreditos(ctx: Contexto, input: unknown): Promise<{ saldo: number | null; duplicado: boolean }> {
  exigir(ctx, "creditos");
  const v = validar(CreditosSchema, input);
  await empresaViva(ctx.db, v.companyId);
  const { data: antes } = await ctx.db.rpc("admin_clientes_listado", {}).eq("id", v.companyId).maybeSingle();
  const { data, error } = await ctx.db.rpc("admin_ajustar_creditos", {
    p_company_id: v.companyId, p_tipo: v.tipo, p_creditos: v.creditos, p_dias_caducidad: v.diasCaducidad, p_actor: ctx.sesion.userId, p_motivo: v.motivo, p_clave: `admin:${v.clave}`,
  });
  if (error) throw deSql(error, "No se pudieron ajustar los créditos.");
  const r = data as { saldo?: number; duplicado?: boolean; lot_id?: string; operacion_id?: string };
  if (!r.duplicado) {
    await auditar(ctx, { accion: v.tipo === "regalo" ? "cliente.creditos_regalo" : "cliente.creditos_ajuste", companyId: v.companyId, objetoTipo: r.lot_id ? "credit_lot" : "credit_operacion", objetoId: r.lot_id ?? r.operacion_id, antes: { saldo: (antes as { saldo?: number } | null)?.saldo ?? null }, despues: { creditos: v.creditos, dias_caducidad: v.creditos > 0 ? v.diasCaducidad : null, saldo: r.saldo ?? null }, motivo: v.motivo });
  }
  return { saldo: r.saldo ?? null, duplicado: Boolean(r.duplicado) };
}

// ── Pausar, suspender, reactivar ────────────────────────────────────────────────────────────────
const EstadoSchema = z.discriminatedUnion("accion", [
  z.object({ companyId: Uuid, accion: z.enum(["pausar", "suspender"]), motivoTipo: z.enum(MOTIVOS_IDS), motivo: Motivo }).strict(),
  z.object({ companyId: Uuid, accion: z.literal("reactivar"), motivo: Motivo }).strict(),
]);
export async function cambiarEstado(ctx: Contexto, input: unknown) {
  const v = validar(EstadoSchema, input);
  exigir(ctx, v.accion === "reactivar" ? "reactivar" : "pausarSuspender");
  await empresaViva(ctx.db, v.companyId);
  const { data: antes } = await ctx.db.rpc("admin_clientes_listado", {}).eq("id", v.companyId).maybeSingle();
  const { data, error } = await ctx.db.rpc("admin_empresa_estado", { p_company_id: v.companyId, p_accion: v.accion, p_motivo_tipo: v.accion === "reactivar" ? null : v.motivoTipo, p_actor: ctx.sesion.userId });
  if (error) throw deSql(error, "No se pudo cambiar el estado.");
  const a = antes as { estado?: string; oficina_pausada?: boolean; estado_oficina?: string } | null;
  await auditar(ctx, { accion: `cliente.${v.accion}`, companyId: v.companyId, objetoTipo: "empresa", objetoId: v.companyId, antes: { estado: a?.estado, oficina_pausada: a?.oficina_pausada, estado_oficina: a?.estado_oficina }, despues: { ...(data as object), ...(v.accion === "reactivar" ? {} : { motivo_tipo: v.motivoTipo }) }, motivo: v.motivo });
  return data as { estado: string };
}

// ── Exportar ────────────────────────────────────────────────────────────────────────────────────
const ExportarSchema = z.object({ companyId: Uuid, motivo: Motivo }).strict();
/** Crea la exportación «procesando»; el llamante la genera en segundo plano con `generarExportacion`. */
export async function pedirExportacion(ctx: Contexto, input: unknown): Promise<string> {
  exigir(ctx, "exportar");
  const v = validar(ExportarSchema, input);
  await empresaViva(ctx.db, v.companyId);
  // Una exportación que lleva más de 15 min «procesando» se perdió (p. ej. el servidor se reinició): se da por fallida.
  const hace15 = new Date((ctx.ahora?.() ?? new Date()).getTime() - 15 * 60_000).toISOString();
  await ctx.db.from("empresa_exportaciones").update({ estado: "error", error: "exportar:interrumpida", terminada_en: new Date().toISOString() }).eq("company_id", v.companyId).eq("estado", "procesando").lt("creado_en", hace15);
  const { count } = await ctx.db.from("empresa_exportaciones").select("id", { count: "exact", head: true }).eq("company_id", v.companyId).eq("estado", "procesando");
  if ((count ?? 0) > 0) throw new ClienteError("Ya hay una exportación en marcha para esta empresa.");
  const { data, error } = await ctx.db.from("empresa_exportaciones").insert({ company_id: v.companyId, solicitada_por: ctx.sesion.userId, motivo: v.motivo }).select("id").single();
  if (error) throw deSql(error, "No se pudo pedir la exportación.");
  await auditar(ctx, { accion: "cliente.exportar", companyId: v.companyId, objetoTipo: "exportacion", objetoId: data.id, motivo: v.motivo });
  return data.id as string;
}

// ── Borrar la empresa ───────────────────────────────────────────────────────────────────────────
const BorrarSchema = z.object({ companyId: Uuid, nombre: z.string().max(300), motivo: Motivo, entiendo: z.literal(true, "Marca que entiendes que no se puede deshacer.") }).strict();
/**
 * Borra los datos de la empresa (solo admin_samgple; doble confirmación: casilla + nombre exacto). Conserva libro contable,
 * lotes, compras (facturas), datos fiscales y servicios contratados. Después borra los archivos de Storage y las cuentas que se quedan sin empresa.
 */
export async function borrarEmpresa(ctx: Contexto, input: unknown): Promise<{ filas: Record<string, number>; cuentasBorradas: number; cuentasPendientes: number }> {
  exigir(ctx, "borrar");
  const v = validar(BorrarSchema, input);
  const empresa = await empresaViva(ctx.db, v.companyId);
  // Lo que se va a borrar fuera de la base, antes de que desaparezcan las filas que lo apuntan.
  const archivosConocimiento = await listarArchivos(ctx.db, "conocimiento", v.companyId);
  const archivosExportacion = await listarArchivos(ctx.db, BUCKET_EXPORTACIONES, v.companyId);
  const { data: resumen } = await ctx.db.rpc("admin_clientes_listado", {}).eq("id", v.companyId).maybeSingle();

  const { data, error } = await ctx.db.rpc("admin_empresa_borrar", { p_company_id: v.companyId, p_nombre_confirmacion: v.nombre, p_actor: ctx.sesion.userId });
  if (error) throw deSql(error, "No se pudo borrar la empresa. No se ha borrado nada.");
  const r = data as { filas: Record<string, number>; miembros: string[] };

  // Storage: mejor esfuerzo (las filas ya no existen; un archivo que quede no es accesible para nadie y se informa).
  let archivosPendientes = 0;
  for (const [bucket, rutas] of [["conocimiento", archivosConocimiento], [BUCKET_EXPORTACIONES, archivosExportacion]] as const) {
    for (let i = 0; i < rutas.length; i += 100) {
      const { error: e } = await ctx.db.storage.from(bucket).remove(rutas.slice(i, i + 100));
      if (e) archivosPendientes += rutas.slice(i, i + 100).length;
    }
  }
  // Cuentas que se quedan sin ninguna empresa ni rol de SAMGPLE: se borran (perfil incluido, por cascada).
  let cuentasBorradas = 0;
  const cuentasPendientes: string[] = [];
  const { data: huerfanas } = r.miembros.length ? await ctx.db.rpc("admin_personas_huerfanas", { p_user_ids: r.miembros }) : { data: [] };
  for (const id of (huerfanas ?? []) as string[]) {
    const { error: e } = await ctx.db.auth.admin.deleteUser(id);
    if (e) cuentasPendientes.push(id); else cuentasBorradas++;
  }
  if (cuentasPendientes.length) console.error(`[admin/clientes] borrado ${v.companyId}: ${cuentasPendientes.length} cuentas no se pudieron borrar (ver auditoría)`);
  await auditar(ctx, {
    accion: "cliente.borrar", companyId: v.companyId, objetoTipo: "empresa", objetoId: v.companyId,
    antes: { nombre: empresa.name, estado: empresa.estado, saldo: (resumen as { saldo?: number } | null)?.saldo ?? null, miembros: r.miembros.length },
    despues: { estado: "borrada", filas_borradas: r.filas, archivos: archivosConocimiento.length + archivosExportacion.length, archivos_pendientes: archivosPendientes, cuentas_borradas: cuentasBorradas, cuentas_pendientes: cuentasPendientes, conservado: ["credit_ledger", "credit_lots", "purchases", "empresa_datos_fiscales", "servicios_contratados"] },
    motivo: v.motivo,
  });
  return { filas: r.filas, cuentasBorradas, cuentasPendientes: cuentasPendientes.length };
}

/** Todas las rutas de un bucket bajo la carpeta de la empresa (recorre subcarpetas). */
async function listarArchivos(db: SupabaseClient, bucket: string, prefijo: string): Promise<string[]> {
  const rutas: string[] = [];
  const pendientes = [prefijo];
  while (pendientes.length) {
    const carpeta = pendientes.pop()!;
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await db.storage.from(bucket).list(carpeta, { limit: 1000, offset });
      if (error || !data) break;
      for (const o of data) {
        if (o.id === null) pendientes.push(`${carpeta}/${o.name}`); // carpeta
        else rutas.push(`${carpeta}/${o.name}`);
      }
      if (data.length < 1000) break;
    }
  }
  return rutas;
}
