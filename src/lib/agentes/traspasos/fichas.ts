/**
 * La ficha de un traspaso: los datos que el agente origen entrega al destino. Cada tipo de traspaso configurado por la empresa
 * ('lead', 'cita', 'incidencia', 'datos', 'otro') tiene su propio esquema zod ESTRICTO: si la ficha no lo cumple, el traspaso no se crea
 * y Claude recibe el error para corregirla. Lo decide el código, no la IA.
 */
import { createHash } from "node:crypto";
import { z } from "zod";
import { neutralizar } from "../../email/untrusted.ts";

export const TIPOS_DE_TRASPASO = ["lead", "cita", "incidencia", "datos", "otro"] as const;
export type TipoTraspaso = (typeof TIPOS_DE_TRASPASO)[number];

/** Tipo de traspaso configurado → tipo de traspaso de la oficina (el que pinta la interfaz). */
export const TIPO_EN_OFICINA = { lead: "lead", cita: "peticion", incidencia: "aviso", datos: "informe", otro: "peticion" } as const;

const texto = (max: number) => z.string().trim().min(1).max(max);
const correo = z.string().trim().toLowerCase().email().max(320);
const telefono = z.string().trim().regex(/^\+?[0-9 ]{7,20}$/, "teléfono no válido (con prefijo, p. ej. +34600111222)");

type Campo = { etiqueta: string; ayuda: string };
type Definicion = { esquema: z.ZodObject<z.ZodRawShape>; campos: Record<string, Campo>; descripcion: string };

const def = (esquema: z.ZodObject<z.ZodRawShape>, descripcion: string, campos: Record<string, Campo>): Definicion => ({ esquema: esquema.strict(), campos, descripcion });

export const FICHAS: Record<TipoTraspaso, Definicion> = {
  lead: def(
    z.object({ nombre: texto(120), contacto: texto(320), interes: texto(300), origen: texto(120).optional(), urgencia: z.enum(["baja", "normal", "alta"]).optional(), presupuesto: texto(120).optional() }),
    "una persona interesada en comprar o contratar",
    {
      nombre: { etiqueta: "Nombre", ayuda: "nombre de la persona" }, contacto: { etiqueta: "Contacto", ayuda: "correo o teléfono" },
      interes: { etiqueta: "Interés", ayuda: "qué quiere" }, origen: { etiqueta: "Origen", ayuda: "canal por el que llegó (opcional)" },
      urgencia: { etiqueta: "Urgencia", ayuda: "baja | normal | alta (opcional)" }, presupuesto: { etiqueta: "Presupuesto", ayuda: "opcional" },
    },
  ),
  cita: def(
    z.object({ nombre: texto(120), motivo: texto(300), contacto: texto(320).optional(), fecha_propuesta: texto(80).optional(), duracion_min: z.number().int().min(5).max(480).optional() }),
    "una cita que hay que agendar",
    {
      nombre: { etiqueta: "Nombre", ayuda: "con quién" }, motivo: { etiqueta: "Motivo", ayuda: "para qué es la cita" }, contacto: { etiqueta: "Contacto", ayuda: "correo o teléfono (opcional)" },
      fecha_propuesta: { etiqueta: "Fecha propuesta", ayuda: "p. ej. «jueves por la tarde» (opcional)" }, duracion_min: { etiqueta: "Duración (min)", ayuda: "entero de 5 a 480 (opcional)" },
    },
  ),
  incidencia: def(
    z.object({ descripcion: texto(600), gravedad: z.enum(["baja", "media", "alta", "critica"]), cliente: texto(160).optional(), referencia: texto(120).optional() }),
    "un problema o queja que debe resolver otro agente",
    {
      descripcion: { etiqueta: "Descripción", ayuda: "qué ha pasado" }, gravedad: { etiqueta: "Gravedad", ayuda: "baja | media | alta | critica" },
      cliente: { etiqueta: "Cliente", ayuda: "opcional" }, referencia: { etiqueta: "Referencia", ayuda: "pedido, factura… (opcional)" },
    },
  ),
  datos: def(
    z.object({ nombre: texto(120), correo, organizacion: texto(160).optional(), cargo: texto(120).optional(), telefono: telefono.optional(), etapa: texto(80).optional(), notas: texto(600).optional() }),
    "los datos de un contacto para registrarlo o actualizarlo (p. ej. en el CRM)",
    {
      nombre: { etiqueta: "Nombre", ayuda: "nombre de la persona" }, correo: { etiqueta: "Correo", ayuda: "correo electrónico válido" }, organizacion: { etiqueta: "Organización", ayuda: "opcional" },
      cargo: { etiqueta: "Cargo", ayuda: "opcional" }, telefono: { etiqueta: "Teléfono", ayuda: "con prefijo (opcional)" }, etapa: { etiqueta: "Etapa", ayuda: "etapa comercial (opcional)" }, notas: { etiqueta: "Notas", ayuda: "opcional" },
    },
  ),
  otro: def(
    z.object({ asunto: texto(200), detalle: texto(1000) }),
    "cualquier otro encargo",
    { asunto: { etiqueta: "Asunto", ayuda: "en una línea" }, detalle: { etiqueta: "Detalle", ayuda: "contexto y qué se espera" } },
  ),
};

/** Lista de campos de un tipo para decírselos a Claude. */
export function describirFicha(tipo: TipoTraspaso): string {
  const d = FICHAS[tipo];
  const obligatorios = new Set(Object.entries(d.esquema.shape).filter(([, v]) => !(v as z.ZodType).safeParse(undefined).success).map(([k]) => k));
  return Object.entries(d.campos).map(([k, c]) => `${k}${obligatorios.has(k) ? "*" : ""} (${c.ayuda})`).join(", ");
}

export type ResultadoFicha = { ok: true; ficha: Record<string, string | number> } | { ok: false; error: string };

/** Valida la ficha contra el esquema de su tipo. El mensaje de error está pensado para que Claude lo corrija. */
export function validarFicha(tipo: TipoTraspaso, ficha: unknown): ResultadoFicha {
  const d = FICHAS[tipo];
  const r = d.esquema.safeParse(ficha ?? {});
  if (r.success) return { ok: true, ficha: r.data as Record<string, string | number> };
  const problemas = r.error.issues.map((i) => {
    if (i.code === "unrecognized_keys") return `- campos que no existen en este tipo: ${(i as { keys: string[] }).keys.join(", ")}`;
    const campo = i.path.join(".") || "ficha";
    return `- ${campo}: ${i.code === "invalid_type" && /undefined/.test(i.message) ? "falta (es obligatorio)" : i.message}`;
  });
  return { ok: false, error: `La ficha no es válida para un traspaso de tipo «${tipo}» (${d.descripcion}).\n${problemas.join("\n")}\nCampos de este tipo (* = obligatorio): ${describirFicha(tipo)}. Corrígela y vuelve a intentarlo.` };
}

/** La ficha como lista etiqueta/valor (lo que muestra la interfaz), con los textos neutralizados. */
export function fichaParaMostrar(tipo: TipoTraspaso, ficha: Record<string, string | number>): { label: string; value: string }[] {
  const d = FICHAS[tipo];
  return Object.entries(d.campos).filter(([k]) => ficha[k] !== undefined).map(([k, c]) => ({ label: c.etiqueta, value: neutralizar(String(ficha[k])) }));
}

/** Huella estable de una ficha (sin importar el orden de los campos ni mayúsculas/espacios): sirve para detectar que «es la misma ficha». */
export function huellaDeFicha(tipo: TipoTraspaso, ficha: Record<string, unknown>): string {
  const norm = Object.keys(ficha).sort().map((k) => `${k}=${String(ficha[k]).normalize("NFD").replace(/\p{M}/gu, "").replace(/\s+/g, " ").trim().toLowerCase()}`).join("|");
  return createHash("sha256").update(`${tipo}|${norm}`).digest("hex").slice(0, 32);
}

export const esTipoDeTraspaso = (t: string): t is TipoTraspaso => (TIPOS_DE_TRASPASO as readonly string[]).includes(t);
