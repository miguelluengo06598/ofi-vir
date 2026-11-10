import { z } from "zod";
import { PERMISOS } from "../herramientas/tipos.ts";
import { LIMITES_PARTES } from "../instrucciones.ts";

const L = LIMITES_PARTES;

// ── Reglas ───────────────────────────────────────────────────────────────────────────────────────
export const DIAS = ["lun", "mar", "mie", "jue", "vie", "sab", "dom"] as const;
export const IDIOMAS = ["es", "en", "ca", "eu", "gl", "fr", "pt", "de", "it"] as const;
export const FUERA_DE_HORARIO = ["responder_y_avisar", "no_responder", "responder_normal"] as const;
export const TIPOS_TRASPASO = ["lead", "cita", "incidencia", "datos", "otro"] as const;

const Hora = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Hora en formato HH:MM");
/** [desde, hasta], p. ej. ["09:00", "20:00"]. */
const Franja = z.array(Hora).length(2).refine(([a, b]) => a < b, "La franja debe empezar antes de acabar");
const zonaValida = (z_: string) => {
  try {
    new Intl.DateTimeFormat("es-ES", { timeZone: z_ });
    return true;
  } catch {
    return false;
  }
};

export const HorarioSchema = z.object(Object.fromEntries(DIAS.map((d) => [d, z.array(Franja).max(3).optional()]))).strict();

export const ReglasSchema = z.object({
  zona_horaria: z.string().max(60).refine(zonaValida, "Zona horaria no válida (p. ej. Europe/Madrid)"),
  /** Un día sin franjas = cerrado. */
  horario: HorarioSchema,
  fuera_de_horario: z.enum(FUERA_DE_HORARIO),
  mensaje_fuera_horario: z.string().trim().max(L.mensajeFueraHorario).nullable(),
  idioma: z.enum(IDIOMAS),
});

// ── Propuesta ────────────────────────────────────────────────────────────────────────────────────
export const PropuestaSchema = z.object({
  /** Lo que lee la empresa: qué ha entendido y, si hay dudas, las preguntas. Breve y en español. */
  respuesta: z.string().trim().min(1).max(2500),
  negocio_resumen: z.string().trim().max(L.negocioResumen),
  tono: z.string().trim().max(L.tono),
  objetivo: z.string().trim().max(L.objetivo),
  nunca_hace: z.string().trim().max(L.nuncaHace),
  instrucciones_empresa: z.string().trim().max(L.instruccionesEmpresa),
  reglas: ReglasSchema,
  permisos: z.array(z.object({
    herramienta_id: z.string().trim().min(1).max(60),
    permiso: z.enum(PERMISOS),
    motivo: z.string().trim().max(250),
  })).max(40),
  traspasos: z.array(z.object({
    agente_id: z.uuid(),
    condicion: z.string().trim().min(1).max(L.condicionTraspaso),
    tipo: z.enum(TIPOS_TRASPASO),
  })).max(L.maxTraspasos),
  /** Qué convendría añadir al conocimiento del agente (preguntas o documentos). */
  conocimiento_que_falta: z.array(z.string().trim().min(1).max(250)).max(10),
  /** Lo que no ha quedado claro y conviene preguntar a la empresa. */
  dudas: z.array(z.string().trim().min(1).max(250)).max(8),
});
export type Propuesta = z.infer<typeof PropuestaSchema>;

/** Campos que la empresa puede aplicar por separado. */
export const CAMPOS_APLICABLES = ["negocio_resumen", "tono", "objetivo", "nunca_hace", "instrucciones_empresa", "reglas", "permisos", "traspasos"] as const;
export type CampoAplicable = (typeof CAMPOS_APLICABLES)[number];

// ── Peticiones ───────────────────────────────────────────────────────────────────────────────────
/** Modo estricto: un `companyId` (o cualquier otro campo) enviado por el cliente se rechaza. */
export const MAX_MENSAJE = 4000;
export const MAX_MENSAJES_SESION = 40;
export const PeticionAsistenteSchema = z.strictObject({
  mensaje: z.string().trim().min(1, "Escribe un mensaje").max(MAX_MENSAJE),
  sesionId: z.uuid().optional(),
});
export const PeticionAplicarSchema = z.strictObject({
  sesionId: z.uuid(),
  /** Solo estos campos (por defecto, todos). */
  campos: z.array(z.enum(CAMPOS_APLICABLES)).min(1).max(CAMPOS_APLICABLES.length).optional(),
});

export type MensajeSesion = { rol: "empresa" | "asistente"; texto: string; en: string };
