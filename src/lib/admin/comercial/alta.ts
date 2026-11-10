/**
 * Alta de cliente. SOLO SERVIDOR. Valida los datos del asistente (zod, estricto); las tareas de implantación salen de la plantilla
 * por defecto (onboarding_templates, las genera alta_cliente);
 * crea los tokens de invitación (solo su huella va a la base) y llama a alta_cliente: una única transacción en la base.
 * Los correos se envían DESPUÉS de confirmar el alta: si un correo falla, el alta no se deshace y el enlace sigue disponible
 * para reenviarlo desde la ficha del cliente.
 */
import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { obtenerPlantilla, PLANTILLAS } from "@/lib/agentes/plantillas";
import { huellaToken } from "@/lib/empresas/api";
import { getPack } from "@/lib/creditos/packs";
import { checkRecipient, emailConfigFromEnv } from "@/lib/email/config";
import { DEPARTAMENTOS_ALTA, DIAS_REGALO_POR_DEFECTO, SERVICIOS_ALTA, TAMANOS } from "./config";
import { correoBienvenida } from "./correo";

const texto = (min: number, max: number) => z.string().trim().min(min).max(max);
const email = z.string().trim().toLowerCase().email().max(254);

export const DatosAltaSchema = z.object({
  solicitudId: z.string().uuid().nullable(),
  empresa: z.object({ nombre: texto(2, 160), sector: texto(0, 80), tamano: z.enum(TAMANOS).nullable(), web: z.string().trim().max(200) }).strict(),
  fiscales: z.object({
    razonSocial: texto(2, 200),
    nif: z.string().trim().transform((v) => v.replace(/[\s.-]/g, "").toUpperCase()).pipe(z.string().regex(/^[A-Z0-9]{8,12}$/, "NIF no válido")),
    direccion: texto(3, 300), codigoPostal: z.string().trim().regex(/^[0-9A-Za-z -]{3,10}$/).transform((v) => v.toUpperCase()),
    ciudad: texto(1, 120), provincia: z.string().trim().max(120), pais: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/), emailFacturacion: email,
  }).strict().nullable(),
  propietario: z.object({ nombre: texto(1, 120), email }).strict(),
  miembros: z.array(z.object({ email, rol: z.enum(["admin", "miembro"]) }).strict()).max(20),
  servicios: z.array(z.object({ servicio: z.enum(SERVICIOS_ALTA.map((s) => s.id) as [string, ...string[]]), importeCentimos: z.number().int().min(0).max(100_000_000).nullable() }).strict()).max(10),
  departamentos: z.array(z.enum(DEPARTAMENTOS_ALTA.map((d) => d.slug) as [string, ...string[]])).min(1).max(5),
  plantillas: z.array(z.string().min(1).max(80)).max(20),
  creditos: z.discriminatedUnion("origen", [
    z.object({ origen: z.literal("pack"), packId: z.string().min(1).max(40) }).strict(),
    z.object({ origen: z.literal("regalo"), creditos: z.number().int().min(1).max(1_000_000), diasCaducidad: z.number().int().min(1).max(730) }).strict(),
    z.object({ origen: z.literal("ninguno") }).strict(),
  ]),
  responsable: z.string().uuid(),
  objetivoFin: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
}).strict();
export type DatosAlta = z.infer<typeof DatosAltaSchema>;

/** Plantillas certificadas que se pueden montar (registro en código + certificación vigente en la base). */
export async function plantillasDisponibles(db: SupabaseClient) {
  const r = await Promise.all(PLANTILLAS.map(async (p) => {
    const { data } = await db.rpc("plantilla_certificada", { p_template_id: p.id });
    return data === true ? { id: p.id, nombre: p.nombrePorDefecto, rol: p.rol, departamento: p.departamentoTipo as string } : null;
  }));
  return r.filter((x): x is NonNullable<typeof x> => x !== null);
}

export type ResultadoAlta =
  | { ok: true; companyId: string; correos: { email: string; propietario: boolean; enviado: boolean; motivo?: string; enlace?: string }[] }
  | { ok: false; mensaje: string };

export async function darDeAlta(
  db: SupabaseClient, actor: string, entrada: unknown,
  env: Record<string, string | undefined> = process.env,
): Promise<ResultadoAlta> {
  const v = DatosAltaSchema.safeParse(entrada);
  if (!v.success) return { ok: false, mensaje: `Revisa los datos: ${v.error.issues[0]?.message ?? "no son válidos"}.` };
  const d = v.data;
  const appUrl = env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/+$/, "") || env.APP_URL?.trim().replace(/\/+$/, "") || null;
  if (!appUrl) return { ok: false, mensaje: "Falta APP_URL: sin ella no se pueden crear los enlaces de invitación." };

  // Agentes: cada plantilla en su departamento (que debe estar elegido).
  const agentes = [];
  for (const id of d.plantillas) {
    const p = obtenerPlantilla(id);
    if (!p) return { ok: false, mensaje: `La plantilla ${id} no existe.` };
    if (!d.departamentos.includes(p.departamentoTipo)) return { ok: false, mensaje: `Para montar a ${p.nombrePorDefecto} hay que elegir su departamento.` };
    agentes.push({ template_id: p.id, nombre: p.nombrePorDefecto, rol: p.rol, departamento_slug: p.departamentoTipo, slug: p.id });
  }

  let creditos: Record<string, unknown> | null = null;
  if (d.creditos.origen === "pack") {
    const pack = await getPack(d.creditos.packId as never);
    if (!pack) return { ok: false, mensaje: "El pack elegido no existe." };
    creditos = { origen: "pack", pack_id: pack.id };
  } else if (d.creditos.origen === "regalo") {
    creditos = { origen: "regalo", creditos: d.creditos.creditos, dias_caducidad: d.creditos.diasCaducidad ?? DIAS_REGALO_POR_DEFECTO };
  }

  // Tokens de invitación: el valor solo existe aquí (para el enlace); la base guarda su huella.
  const tokenPropietario = randomBytes(32).toString("base64url");
  const miembros = d.miembros.filter((m) => m.email !== d.propietario.email).map((m) => ({ ...m, token: randomBytes(32).toString("base64url") }));

  const { data, error } = await db.rpc("alta_cliente", {
    p_actor: actor,
    p: {
      solicitud_id: d.solicitudId,
      empresa: { nombre: d.empresa.nombre, sector: d.empresa.sector || null, tamano: d.empresa.tamano, web: d.empresa.web || null },
      fiscales: d.fiscales && {
        razon_social: d.fiscales.razonSocial, nif: d.fiscales.nif, direccion: d.fiscales.direccion, codigo_postal: d.fiscales.codigoPostal,
        ciudad: d.fiscales.ciudad, provincia: d.fiscales.provincia || null, pais: d.fiscales.pais, email_facturacion: d.fiscales.emailFacturacion,
      },
      propietario: { nombre: d.propietario.nombre, email: d.propietario.email, token_hash: huellaToken(tokenPropietario) },
      miembros: miembros.map((m) => ({ email: m.email, rol: m.rol, token_hash: huellaToken(m.token) })),
      servicios: d.servicios.map((s) => ({ servicio: s.servicio, importe_centimos: s.importeCentimos, periodicidad: SERVICIOS_ALTA.find((x) => x.id === s.servicio)?.periodicidad ?? "unico" })),
      departamentos: DEPARTAMENTOS_ALTA.filter((x) => d.departamentos.includes(x.slug)),
      agentes,
      creditos,
      responsable: d.responsable,
      objetivo_fin: d.objetivoFin,
    },
  });
  if (error || !data) {
    const conocido = /^[A-Z_]+:/.test(error?.message ?? "") ? error!.message.split(":").slice(1).join(":").trim() : null;
    return { ok: false, mensaje: conocido ? `No se ha creado nada: ${conocido}.` : "No se ha creado nada: falló el alta. Revisa los datos e inténtalo de nuevo." };
  }
  const companyId = (data as { company_id: string }).company_id;
  // Las tareas salen de la plantilla de implantación (las genera alta_cliente): el correo lista las que le tocan al cliente.
  const { data: tareasCreadas } = await db.from("implantacion_tareas").select("titulo").eq("implantacion_id", (data as { implantacion_id: string }).implantacion_id).eq("para", "cliente").neq("estado", "hecha").order("orden");

  // Correos (después de la transacción). En desarrollo solo a direcciones de prueba o de EMAIL_DEV_ALLOWLIST.
  const { data: resp } = await db.from("platform_roles").select("nombre").eq("user_id", d.responsable).maybeSingle();
  const { data: respEmail } = await db.from("users").select("email").eq("id", d.responsable).maybeSingle();
  const config = emailConfigFromEnv(env);
  const tareasCliente = (tareasCreadas ?? []).map((t) => t.titulo as string);
  const destinatarios = [
    { email: d.propietario.email, propietario: true, enlace: `${appUrl}/invitacion/${tokenPropietario}` },
    ...miembros.map((m) => ({ email: m.email, propietario: false, enlace: `${appUrl}/invitacion/${m.token}` })),
  ];
  const correos: Extract<ResultadoAlta, { ok: true }>["correos"] = [];
  for (const dest of destinatarios) {
    const permitido = checkRecipient(dest.email, config);
    // Fuera de producción, el enlace se devuelve para poder probar el flujo aunque el correo no se envíe.
    const enlaceVisible = config.production ? undefined : dest.enlace;
    if (!config.apiKey || !config.from) { correos.push({ email: dest.email, propietario: dest.propietario, enviado: false, motivo: "Resend no está configurado.", enlace: enlaceVisible }); continue; }
    if (!permitido.allowed) { correos.push({ email: dest.email, propietario: dest.propietario, enviado: false, motivo: "En desarrollo solo se envía a direcciones de prueba.", enlace: enlaceVisible }); continue; }
    try {
      await correoBienvenida(config, {
        para: dest.email, empresa: d.empresa.nombre, nombre: dest.propietario ? d.propietario.nombre : null, enlace: dest.enlace, propietario: dest.propietario,
        responsable: { nombre: (resp?.nombre as string | null) ?? "tu responsable de SAMGPLE", email: (respEmail?.email as string | null) ?? null },
        pasos: tareasCliente,
      });
      correos.push({ email: dest.email, propietario: dest.propietario, enviado: true, enlace: enlaceVisible });
    } catch {
      correos.push({ email: dest.email, propietario: dest.propietario, enviado: false, motivo: "Resend rechazó el envío.", enlace: enlaceVisible });
    }
  }
  return { ok: true, companyId, correos };
}
