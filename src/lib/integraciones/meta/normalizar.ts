/**
 * Normaliza un lead de Meta (respuesta de `GET /{leadgen_id}`) a lo que guarda la oficina. Función pura, sin red.
 *  - Campos estándar de Meta: full_name / first_name + last_name, email, phone_number. El teléfono va en formato
 *    internacional (E.164, `+34600111222`); sin prefijo y con 9 cifras se asume el país por defecto (España).
 *  - El resto de campos son preguntas personalizadas del formulario: se guardan tal cual, con su nombre.
 *  - `custom_disclaimer_responses` son las casillas (consentimientos) que marcó la persona.
 * Nada de esto es una instrucción: el agente lo recibe dentro de `<contenido_externo>`.
 */
import { z } from "zod";

const Valores = z.array(z.union([z.string(), z.number(), z.boolean()]).transform(String)).max(50).catch([]);
export const LeadDeMeta = z.object({
  id: z.string().regex(/^[0-9]{1,32}$/),
  created_time: z.string().max(40).optional(),
  form_id: z.string().regex(/^[0-9]{1,32}$/).optional(),
  ad_id: z.string().regex(/^[0-9]{1,32}$/).optional(),
  ad_name: z.string().max(400).optional(),
  adset_name: z.string().max(400).optional(),
  campaign_id: z.string().regex(/^[0-9]{1,32}$/).optional(),
  campaign_name: z.string().max(400).optional(),
  is_organic: z.boolean().optional(),
  platform: z.string().max(20).optional(),
  field_data: z.array(z.object({ name: z.string().max(400), values: Valores })).max(200).default([]),
  custom_disclaimer_responses: z.array(z.object({ checkbox_key: z.string().max(200).optional(), is_checked: z.union([z.boolean(), z.string()]).optional() })).max(50).optional(),
});
export type LeadDeMeta = z.infer<typeof LeadDeMeta>;

export type LeadNormalizado = {
  nombre: string | null;
  email: string | null;
  telefono: string | null;
  /** Teléfono tal como llegó, si no se pudo pasar a formato internacional. */
  telefonoOriginal: string | null;
  /** Preguntas personalizadas del formulario, en orden. */
  respuestas: { pregunta: string; respuesta: string }[];
  consentimientos: { casilla: string; marcada: boolean }[];
  campana: string | null;
  anuncio: string | null;
  plataforma: string | null;
  creadoEn: string | null;
};

const ESTANDAR = new Set(["full_name", "first_name", "last_name", "email", "phone_number", "phone"]);
const limpio = (s: string | undefined, max = 1000) => {
  const t = (s ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
  return t || null;
};

/** Teléfono en formato internacional (E.164). null si no se puede saber con seguridad. */
export function telefonoInternacional(bruto: string | null | undefined, prefijoPorDefecto = "34"): string | null {
  if (!bruto) return null;
  let t = bruto.replace(/[\s().\-/]/g, "");
  if (t.startsWith("00")) t = `+${t.slice(2)}`;
  if (!t.startsWith("+")) {
    if (!/^\d+$/.test(t)) return null;
    // Sin prefijo: solo se asume el país por defecto si encaja (España: 9 cifras que empiezan por 6, 7, 8 o 9).
    if (prefijoPorDefecto === "34" && /^[6789]\d{8}$/.test(t)) t = `+34${t}`;
    else if (t.startsWith(prefijoPorDefecto) && t.length > prefijoPorDefecto.length + 6) t = `+${t}`;
    else return null;
  }
  return /^\+[1-9]\d{6,14}$/.test(t) ? t : null;
}

const pregunta = (nombre: string) => {
  // Meta da el nombre interno de la pregunta (p. ej. «¿cuándo_quieres_empezar?»): se deja legible.
  const t = nombre.replace(/_/g, " ").replace(/\s+/g, " ").trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : "Pregunta";
};

export function normalizarLead(lead: LeadDeMeta, prefijoPorDefecto = "34"): LeadNormalizado {
  const campo = (n: string) => limpio(lead.field_data.find((f) => f.name === n)?.values.join(", "));
  const nombre = campo("full_name") ?? limpio([campo("first_name"), campo("last_name")].filter(Boolean).join(" "));
  const emailBruto = campo("email")?.toLowerCase() ?? null;
  const email = emailBruto && z.email().max(254).safeParse(emailBruto).success ? emailBruto : null;
  const telefonoOriginal = campo("phone_number") ?? campo("phone");
  const telefono = telefonoInternacional(telefonoOriginal, prefijoPorDefecto);
  return {
    nombre: limpio(nombre ?? undefined, 200),
    email,
    telefono,
    telefonoOriginal: telefono ? null : telefonoOriginal,
    respuestas: lead.field_data
      .filter((f) => !ESTANDAR.has(f.name))
      .map((f) => ({ pregunta: pregunta(f.name).slice(0, 300), respuesta: limpio(f.values.join(", ")) ?? "" }))
      .slice(0, 100),
    consentimientos: (lead.custom_disclaimer_responses ?? []).map((c) => ({
      casilla: limpio(c.checkbox_key, 200) ?? "Casilla",
      marcada: c.is_checked === true || c.is_checked === "1" || c.is_checked === "true",
    })),
    campana: limpio(lead.campaign_name, 300),
    anuncio: limpio(lead.ad_name, 300),
    plataforma: lead.platform === "ig" ? "Instagram" : lead.platform === "fb" ? "Facebook" : null,
    creadoEn: lead.created_time ?? null,
  };
}

/** El lead como texto para el agente (irá dentro de `<contenido_externo>`). */
export function textoParaAgente(l: LeadNormalizado, formulario: string | null): string {
  const lineas = [
    `Lead nuevo de ${l.plataforma ?? "Facebook o Instagram"} (Meta Lead Ads).`,
    formulario && `Formulario: ${formulario}`,
    l.campana && `Campaña: ${l.campana}`,
    l.anuncio && `Anuncio: ${l.anuncio}`,
    `Nombre: ${l.nombre ?? "(no lo indicó)"}`,
    `Correo: ${l.email ?? "(no lo indicó)"}`,
    `Teléfono: ${l.telefono ?? l.telefonoOriginal ?? "(no lo indicó)"}`,
  ].filter(Boolean) as string[];
  if (l.respuestas.length) lineas.push("Respuestas del formulario:", ...l.respuestas.map((r) => `- ${r.pregunta}: ${r.respuesta || "(sin respuesta)"}`));
  if (l.consentimientos.length) lineas.push("Casillas de consentimiento:", ...l.consentimientos.map((c) => `- ${c.casilla}: ${c.marcada ? "marcada" : "sin marcar"}`));
  return lineas.join("\n");
}
