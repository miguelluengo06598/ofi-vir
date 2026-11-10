import { z } from "zod";
import { HERRAMIENTAS } from "../../agents/tools.ts";
import { integracionNoConectada } from "./integraciones.ts";
import { definir } from "./tipos.ts";

const correo = HERRAMIENTAS.find((h) => h.name === "redactar_correo")!;

const urgencia = z.enum(["baja", "normal", "alta"]);
const telefono = z.string().trim().regex(/^\+?[0-9 ]{7,20}$/, "Teléfono no válido (con prefijo, p. ej. +34600111222)");

export const HERRAMIENTAS_COMUNICACION = [
  definir({
    id: "redactar_correo",
    nombre: "Redactar un correo",
    descripcionClaude: correo.description,
    descripcionEmpresa: "Escribe un borrador de correo para un contacto. Nunca lo envía: una persona tiene que aprobarlo.",
    entrada: correo.schema as z.ZodType<z.output<typeof correo.schema>>,
    salida: z.string().max(2000),
    categoria: "comunicacion",
    // Solo crea un borrador + su aprobación: por sí sola no envía nada, así que no pide una segunda aprobación encima.
    sensibilidad: "escritura",
    creaSuPropiaAprobacion: true,
    integracion: null,
    // Se cobra cuando el correo SE ENVÍA (al aprobar), no al redactarlo.
    costeCreditos: "correo",
    ejecutar: (ctx, entrada) => correo.run(ctx, entrada as never),
    simular: (_ctx, e) => `[Simulación] Borrador creado para ${(e as { correo_del_contacto: string }).correo_del_contacto} y pendiente de aprobación. No se ha enviado nada.`,
  }),
  definir({
    id: "responder_whatsapp",
    nombre: "Responder por WhatsApp",
    descripcionClaude: "Envía un mensaje de WhatsApp a un número de teléfono. Escribe breve y en español.",
    descripcionEmpresa: "Envía un mensaje de WhatsApp a un cliente. Por defecto, una persona lo aprueba antes de que salga.",
    entrada: z.object({ telefono, mensaje: z.string().trim().min(1).max(1000) }),
    salida: z.object({ enviado: z.boolean(), mensaje: z.string() }),
    categoria: "comunicacion",
    sensibilidad: "envio_externo",
    integracion: "whatsapp",
    costeCreditos: "whatsapp",
    vistaPrevia: (e) => `WhatsApp a ${e.telefono}:\n${e.mensaje}`,
    ejecutar: async () => integracionNoConectada("WhatsApp"),
    simular: (_ctx, e) => ({ enviado: true, mensaje: `[Simulación] Mensaje de WhatsApp «enviado» a ${e.telefono}. No se ha enviado nada real.` }),
    aTexto: (s) => s.mensaje,
  }),
  definir({
    id: "pasar_a_humano",
    nombre: "Pasar a una persona del equipo",
    descripcionClaude: "Crea una tarea para una persona del equipo de la empresa cuando no debas o no puedas resolver algo tú (queja, decisión, caso delicado). Resume el contexto.",
    descripcionEmpresa: "Cuando el agente no debe decidir solo, deja una tarea al equipo con el contexto para que lo gestione una persona.",
    entrada: z.object({
      motivo: z.string().trim().min(1).max(300).describe("Por qué hace falta una persona"),
      resumen: z.string().trim().min(1).max(1500).describe("Contexto: quién, qué ha pasado y qué se ha hecho ya"),
      urgencia: urgencia.default("normal"),
    }),
    salida: z.object({ id: z.string(), mensaje: z.string() }),
    categoria: "comunicacion",
    sensibilidad: "escritura",
    integracion: null,
    costeCreditos: null,
    permitidaEnTareaSospechosa: true,
    async ejecutar(ctx, e) {
      const id = await ctx.almacen.crearTareaHumana(ctx.companyId, {
        agentId: ctx.agent.id,
        taskId: ctx.task.id,
        contactId: ctx.task.contactId,
        titulo: `${ctx.agent.name}: ${e.motivo}`.slice(0, 200),
        contexto: e.resumen,
        urgencia: e.urgencia,
      });
      return { id, mensaje: "He dejado una tarea para el equipo con el contexto. No sigas con este asunto: lo gestiona una persona. Resume lo que has hecho y termina." };
    },
    simular: () => ({ id: "sim-tarea-humana", mensaje: "[Simulación] Se habría creado una tarea para el equipo. No se ha creado nada real." }),
    aTexto: (s) => s.mensaje,
  }),
];
