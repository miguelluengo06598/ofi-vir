/**
 * Textos y supuestos de /precios. Las tarifas salen de src/lib/creditos/tarifas.ts y los packs de
 * credit_packs: aquí no hay ningún número de créditos escrito a mano.
 *
 * SUPUESTOS DE LA COMPARACIÓN CON CONTRATAR: PENDIENTES DE CONFIRMAR. CLAUDE.md remite a
 * docs/modelo-de-negocio-y-creditos.md para el cálculo de coste de personal, pero ese documento no existe
 * todavía. Los valores de abajo son de partida, el visitante los puede cambiar y en local se marcan como
 * pendientes. Sustituirlos por los del documento en cuanto esté.
 */
import { CONSUMOS_FIJOS, IVA_PORCENTAJE, TIPOS_DE_TAREA } from "@/lib/creditos/tarifas";

export const ideasPrecios = [
  { titulo: "Sin cuotas", texto: "Ni mensualidad ni mantenimiento. Si un mes hay poco trabajo, gastas poco." },
  { titulo: "Departamentos y agentes gratis", texto: "Activa los que necesites. Solo cuestan las tareas que hacen." },
  { titulo: "1 crédito = 1 céntimo", texto: "Cada tipo de tarea tiene un precio fijo que conoces antes de empezar." },
] as const;

export type TarifaVisible = { id: string; nombre: string; creditos: number | null; ejemplos: string; icono: "chispa" | "mensaje" | "cerebro" | "flechas" | "correo" | "whatsapp" };

export const tarifasVisibles: TarifaVisible[] = [
  { id: "simple", nombre: "Tarea simple", creditos: TIPOS_DE_TAREA.simple.creditos, ejemplos: "Contestar una pregunta frecuente, clasificar un correo, registrar un dato en el CRM.", icono: "chispa" },
  { id: "estandar", nombre: "Tarea estándar", creditos: TIPOS_DE_TAREA.estandar.creditos, ejemplos: "Responder y cualificar un lead, preparar el borrador de un correo.", icono: "mensaje" },
  { id: "experta", nombre: "Tarea experta", creditos: TIPOS_DE_TAREA.experta.creditos, ejemplos: "Preparar una propuesta comercial, configurar un agente con el asistente.", icono: "cerebro" },
  { id: "traspaso", nombre: "Traspaso entre departamentos", creditos: CONSUMOS_FIJOS.traspaso, ejemplos: "Lucía pasa un lead cualificado a Iván para el CRM.", icono: "flechas" },
  { id: "correo", nombre: "Correo enviado", creditos: CONSUMOS_FIJOS.correo, ejemplos: "Cada correo que sale, después de que lo apruebes.", icono: "correo" },
  // La tarifa de WhatsApp está pendiente de definir (CLAUDE.md): no se publica el valor provisional del código.
  { id: "whatsapp", nombre: "Mensaje de WhatsApp", creditos: null, ejemplos: "Dependerá de la tarifa de Meta. La publicaremos antes de activar WhatsApp.", icono: "whatsapp" },
];

/**
 * Supuestos de partida de la comparación con contratar (editables por el visitante). PENDIENTES DE
 * CONFIRMAR con el documento del proyecto.
 */
export const SUPUESTOS_PERSONAL = {
  /** Sueldo bruto anual de una persona para este trabajo (atención, primera respuesta, CRM). */
  sueldoBrutoAnual: 22_000,
  /** Cotización a cargo de la empresa sobre el bruto, aproximada (contingencias comunes, desempleo, FOGASA, FP, MEI). */
  cotizacionEmpresaPct: 31,
  /** Mensaje de producto, no una medición: con agentes, una persona absorbe el volumen de tres. */
  rindeComo: 3,
  /** Horas al mes que dedica la persona a revisar y aprobar lo que preparan los agentes. */
  horasRevisionMes: 20,
} as const;

export const preguntasPrecios = (caducidadMeses: string, caducidadPrueba: string | null) => [
  {
    p: "¿Caducan los créditos?",
    r: `Sí, a los ${caducidadMeses} de su compra${caducidadPrueba ? ` (los del pack Prueba, a los ${caducidadPrueba})` : ""}. Se gastan primero los que caducan antes y te avisamos con tiempo si un lote grande está a punto de caducar.`,
  },
  {
    p: "¿Puedo poner un tope de gasto?",
    r: "Sí. Fijas un máximo de créditos al mes para toda la oficina y otro para cada agente. Al llegar al tope, no empiezan tareas nuevas que gasten créditos y te avisamos.",
  },
  {
    p: "¿Qué pasa si me quedo sin créditos?",
    r: "Los agentes dejan de empezar tareas nuevas, pero lo que llega (correos, mensajes) se sigue guardando para que no pierdas nada. Compras un pack y siguen donde lo dejaron. Si quieres, activa la recarga automática.",
  },
  {
    p: "¿Los precios llevan IVA?",
    r: `No. Los precios de los packs son sin IVA; al pagar se añade el IVA (${IVA_PORCENTAJE} %).`,
  },
  {
    p: "¿Qué es el bono mensual?",
    r: "Es comprar tu pack cada mes como suscripción: recibes más créditos por el mismo precio. Lo cancelas cuando quieras y conservas los créditos que ya tengas.",
  },
];
