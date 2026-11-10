/**
 * Textos de la portada («la historia que se cuenta al bajar»). Sin testimonios ni cifras de clientes:
 * los nombres y correos de la demo son ficticios (dominio .test).
 */

export const heroInicio = {
  titular: "Tu empresa, con un equipo de IA que trabaja como un equipo de verdad",
  subtitulo:
    "Agentes de ventas, atención, marketing y CRM que se pasan el trabajo entre ellos, conectados a tus herramientas. Tú solo apruebas lo importante.",
} as const;

export const problemaInicio = [
  { id: "noche", titulo: "Un lead escribe a las 22:00. Nadie contesta hasta mañana.", texto: "Por la mañana ya ha pedido presupuesto a otro. El lead estaba caliente y se enfrió esperando." },
  { id: "whatsapp", titulo: "Ventas no sabe lo que el cliente preguntó por WhatsApp.", texto: "Cada canal es una isla. El cliente repite su historia y tu equipo empieza de cero." },
  { id: "crm", titulo: "El CRM lleva meses sin actualizarse.", texto: "Fichas a medias, duplicados y notas que nadie escribió. Decides a ciegas." },
] as const;

/** Pasos del vídeo cadena-anuncio-a-venta (sus marcas de tiempo están en src/config/videos.ts). */
export const pasosCadena = [
  { quien: "Marketing · Meta Ads", texto: "Un anuncio de Meta genera un lead" },
  { quien: "Lucía · Ventas", texto: "Lucía responde en minutos" },
  { quien: "Tú", texto: "Se te pide aprobar el correo" },
  { quien: "Tú", texto: "Lo apruebas con un clic" },
  { quien: "Iván · CRM", texto: "Iván lo registra en el CRM" },
  { quien: "Marketing", texto: "Marketing aprende qué leads compran" },
] as const;

export const controlInicio = [
  { titulo: "Nada sensible sale sin tu aprobación", texto: "Un correo a un cliente, un gasto o una publicación esperan a que tú digas que sí." },
  { titulo: "Solo trabajan cuando llega algo o tú se lo pides", texto: "Un mensaje, un lead, una orden tuya o una rutina que activaste. Nunca por su cuenta." },
  { titulo: "Cada agente, certificado por SAMGPLE", texto: "Examen técnico con datos ficticios y revisión de una persona antes de tocar datos reales." },
  { titulo: "Tus datos, aislados y en la UE", texto: "Cada empresa solo ve lo suyo. Tu base de datos y tus archivos se alojan en la UE." },
] as const;

/** Borrador de la demo de aprobación. Ficticio: no se envía nada. */
export const borradorDemo = {
  de: "Lucía · Ventas",
  para: "elena.prado@correo.test",
  asunto: "Tu cita para el blanqueamiento",
  cuerpo: [
    "Hola, Elena:",
    "El blanqueamiento son dos sesiones de una hora. Esta semana tenemos el jueves a las 17:30 o el viernes a las 18:00.",
    "¿Te va bien alguna?",
    "Lucía · Clínica Sol (asistente de IA)",
  ],
} as const;
