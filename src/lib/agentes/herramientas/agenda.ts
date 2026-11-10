import { z } from "zod";
import { integracionNoConectada } from "./integraciones.ts";
import { definir } from "./tipos.ts";

const fecha = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha AAAA-MM-DD");
const instante = z.string().trim().datetime({ offset: true }).describe("Fecha y hora ISO con zona, p. ej. 2026-11-12T10:00:00+01:00");

export const HERRAMIENTAS_AGENDA = [
  definir({
    id: "ver_huecos_agenda",
    nombre: "Ver huecos libres de la agenda",
    descripcionClaude: "Devuelve los huecos libres de la agenda entre dos fechas para una duración dada.",
    descripcionEmpresa: "Consulta en vuestro calendario qué horas están libres.",
    entrada: z.object({ desde: fecha, hasta: fecha, duracion_min: z.number().int().min(15).max(240).default(30) }),
    salida: z.object({ huecos: z.array(z.object({ inicio: z.string(), fin: z.string() })).max(50) }),
    categoria: "agenda", sensibilidad: "lectura", integracion: "google_calendar", costeCreditos: null, datosExternos: true,
    ejecutar: async () => integracionNoConectada("Google Calendar"),
    simular: (_c, e) => ({
      huecos: [
        { inicio: `${e.desde}T10:00:00+01:00`, fin: `${e.desde}T${e.duracion_min >= 60 ? "11" : "10"}:${e.duracion_min % 60 || "00"}:00+01:00` },
        { inicio: `${e.hasta}T12:30:00+01:00`, fin: `${e.hasta}T13:00:00+01:00` },
      ],
    }),
  }),
  definir({
    id: "crear_cita",
    nombre: "Crear una cita",
    descripcionClaude: "Crea una cita en la agenda e invita al contacto. Comprueba antes los huecos con ver_huecos_agenda.",
    descripcionEmpresa: "Reserva una cita en vuestro calendario y avisa a la persona invitada. Por defecto, una persona lo aprueba antes.",
    entrada: z.object({ titulo: z.string().trim().min(1).max(200), inicio: instante, duracion_min: z.number().int().min(15).max(240).default(30), correo_del_contacto: z.string().trim().toLowerCase().email().max(320).optional() }),
    salida: z.object({ id: z.string(), mensaje: z.string() }),
    categoria: "agenda",
    // Invita a una persona de fuera: es un envío externo.
    sensibilidad: "envio_externo", integracion: "google_calendar", costeCreditos: null,
    vistaPrevia: (e) => `Cita «${e.titulo}» el ${e.inicio} (${e.duracion_min} min)${e.correo_del_contacto ? ` con ${e.correo_del_contacto}` : ""}`,
    ejecutar: async () => integracionNoConectada("Google Calendar"),
    simular: (_c, e) => ({ id: "sim-cita-1", mensaje: `[Simulación] Cita «${e.titulo}» creada el ${e.inicio}. No se ha creado nada real.` }),
    aTexto: (s) => s.mensaje,
  }),
];
