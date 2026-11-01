import type { Agent } from "./agents";
import { marketAgents } from "./marketplace";

export type Message = {
  id: string;
  /** `system`: avisos automáticos (p. ej. consultas al experto). */
  from: "agent" | "me" | "system";
  text: string;
  time: string;
  day: "Ayer" | "Hoy";
};

export type Conversation = { agentId: string; messages: Message[]; unread: number };

export type AgentFile = { name: string; kind: "doc" | "sheet" | "image"; when: string };

/** Datos de la ficha del agente que no están en `agents.ts`. */
export const agentProfiles: Record<string, { avgCostPerTask: number; files: AgentFile[]; suggestions: string[] }> = {
  "lucia-ramos": {
    avgCostPerTask: 3.2,
    files: [
      { name: "Seguimientos-webinar-octubre.xlsx", kind: "sheet", when: "Hoy" },
      { name: "Plantilla-seguimiento-v3.docx", kind: "doc", when: "Ayer" },
    ],
    suggestions: ["¿Cómo van los seguimientos?", "Prioriza los leads del webinar", "Envíame un resumen"],
  },
  "daniel-prieto": {
    avgCostPerTask: 1.6,
    files: [{ name: "Puntuacion-leads-semana-44.xlsx", kind: "sheet", when: "Hoy" }],
    suggestions: ["¿Qué leads son los mejores?", "Cambia el umbral de puntuación"],
  },
  "irene-soler": {
    avgCostPerTask: 7.4,
    files: [
      { name: "Propuesta-Clinica-Dental-Sol.docx", kind: "doc", when: "Hoy" },
      { name: "Presupuesto-plan-anual.xlsx", kind: "sheet", when: "Hoy" },
      { name: "Propuesta-Taller-Medina.docx", kind: "doc", when: "Hace 3 días" },
    ],
    suggestions: ["Rebaja el precio un 5 %", "Añade condiciones de pago", "Envía la propuesta"],
  },
  "sofia-navarro": {
    avgCostPerTask: 0.9,
    files: [{ name: "Preguntas-frecuentes-octubre.docx", kind: "doc", when: "Ayer" }],
    suggestions: ["¿Cuántas consultas hay abiertas?", "Resume las incidencias de hoy"],
  },
  "hugo-lara": {
    avgCostPerTask: 0.8,
    files: [{ name: "Clasificacion-correos-soporte.xlsx", kind: "sheet", when: "Hoy" }],
    suggestions: ["¿Qué correos son urgentes?", "Resume el buzón"],
  },
  "carla-medina": {
    avgCostPerTask: 5.1,
    files: [
      { name: "Boletin-noviembre-borrador.docx", kind: "doc", when: "Hoy" },
      { name: "Portada-boletin.png", kind: "image", when: "Hoy" },
    ],
    suggestions: ["Hazlo más cercano", "Propón tres asuntos", "Acorta el primer párrafo"],
  },
  "alvaro-rios": {
    avgCostPerTask: 4.3,
    files: [
      { name: "Campana-otono-resultados.xlsx", kind: "sheet", when: "Hoy" },
      { name: "Creatividad-Otono-en-casa.png", kind: "image", when: "Ayer" },
    ],
    suggestions: ["¿Cómo rinde la campaña?", "Aprueba los cambios", "Pausa los anuncios flojos"],
  },
  "nuria-campos": {
    avgCostPerTask: 1.2,
    files: [{ name: "Fichas-clientes-actualizadas.xlsx", kind: "sheet", when: "Hoy" }],
    suggestions: ["¿Hay duplicados?", "Avísame al terminar"],
  },
  "tomas-vidal": {
    avgCostPerTask: 1.9,
    files: [
      { name: "Factura-2024-0187.pdf", kind: "doc", when: "Hoy" },
      { name: "Cierre-octubre.xlsx", kind: "sheet", when: "Hoy" },
    ],
    suggestions: ["¿Cuántas facturas faltan?", "Envíame el cierre"],
  },
  "elena-bravo": {
    avgCostPerTask: 6.8,
    files: [
      { name: "Informe-semanal-44.docx", kind: "doc", when: "Ayer" },
      { name: "Cuadro-de-mando.xlsx", kind: "sheet", when: "Hoy" },
    ],
    suggestions: ["Resume lo más importante", "¿Cómo va el gasto de créditos?"],
  },
};

const m = (id: string, from: Message["from"], day: Message["day"], time: string, text: string): Message => ({
  id,
  from,
  day,
  time,
  text,
});

export const initialConversations: Conversation[] = [
  {
    agentId: "lucia-ramos",
    unread: 0,
    messages: [
      m("l1", "me", "Ayer", "18:05", "Lucía, ¿puedes retomar los leads del webinar de octubre?"),
      m("l2", "agent", "Ayer", "18:06", "Claro. Son 14 contactos sin respuesta; les preparo un seguimiento personalizado."),
      m("l2b", "system", "Ayer", "18:20", "Lucía ha pedido ayuda a su creadora, Ana Martín. Respuesta estimada: 4 h"),
      m("l2c", "system", "Ayer", "22:05", "Ana Martín ha respondido. Lucía retoma el trabajo."),
      m("l3", "agent", "Hoy", "09:12", "Buenos días, Marcos. Ya envié 9 seguimientos y quedan 5 por enviar. Dos leads han respondido."),
      m("l4", "me", "Hoy", "09:20", "Perfecto. Avísame si alguno pide una reunión."),
    ],
  },
  {
    agentId: "irene-soler",
    unread: 1,
    messages: [
      m("i1", "agent", "Ayer", "16:40", "He terminado el borrador de la propuesta para Clínica Dental Sol."),
      m("i2", "me", "Ayer", "17:02", "Gracias, la reviso mañana."),
      m("i3", "agent", "Hoy", "10:15", "La propuesta de 4.200 € está lista y espera tu aprobación para enviarla."),
    ],
  },
  {
    agentId: "hugo-lara",
    unread: 1,
    messages: [
      m("h1", "agent", "Hoy", "09:50", "Tengo una reclamación de facturación con un cobro duplicado y no estoy seguro de cómo resolverla."),
      m("h2", "system", "Hoy", "09:52", "Hugo ha pedido ayuda a su creadora, Inés Ortuño. Respuesta estimada: 2 h"),
    ],
  },
  {
    agentId: "sofia-navarro",
    unread: 2,
    messages: [
      m("s1", "agent", "Hoy", "11:30", "Tengo 9 conversaciones abiertas en el chat web, ninguna con más de 5 minutos de espera."),
      m("s2", "agent", "Hoy", "11:42", "Una clienta pide un reembolso de 89 €. ¿Lo escalo a una persona del equipo?"),
    ],
  },
  {
    agentId: "carla-medina",
    unread: 0,
    messages: [
      m("c1", "me", "Ayer", "12:10", "Carla, necesito el boletín de noviembre con foco en la oferta de otoño."),
      m("c2", "agent", "Ayer", "12:14", "Entendido. Te paso un borrador esta tarde con tres secciones y una llamada a la acción."),
      m("c3", "agent", "Hoy", "08:55", "Borrador listo. Está en Notion; dime si quieres un tono más cercano."),
    ],
  },
  {
    agentId: "alvaro-rios",
    unread: 1,
    messages: [
      m("a1", "agent", "Hoy", "09:40", "La campaña de otoño supera su objetivo de clics en un 18 %."),
      m("a2", "agent", "Hoy", "09:41", "Te he dejado dos cambios pendientes de aprobación en la oficina."),
    ],
  },
  {
    agentId: "nuria-campos",
    unread: 0,
    messages: [
      m("n1", "agent", "Ayer", "19:20", "Terminé la primera mitad de la actualización del CRM."),
      m("n2", "me", "Ayer", "19:25", "Genial, sigue con el resto mañana."),
    ],
  },
  {
    agentId: "elena-bravo",
    unread: 0,
    messages: [
      m("e1", "agent", "Ayer", "17:30", "El informe semanal está enviado a la dirección."),
      m("e2", "agent", "Hoy", "09:00", "Aviso: el gasto de créditos de Marketing sube un 12 % respecto a la semana pasada."),
    ],
  },
];

/** Respuesta simulada del agente; rota según el número de mensajes de la conversación. */
export function simulatedReply(agent: Agent, round: number) {
  const first = agent.name.split(" ")[0];
  const task = agent.status === "waiting" ? "a la espera de tu aprobación" : agent.task;
  const replies = [
    `Entendido. Ahora mismo estoy ${task}; en cuanto termine me pongo con lo que me pides.`,
    `Hecho, lo anoto. Si necesitas algo más de mi parte, dímelo y lo priorizo.`,
    `Gracias, Marcos. Te confirmo por aquí en cuanto lo tenga listo. — ${first}`,
  ];
  return replies[round % replies.length];
}

/** Perfil del agente; los recién contratados no tienen archivos y parten del coste medio del marketplace. */
export function getAgentProfile(agentId: string) {
  const known = agentProfiles[agentId];
  if (known) return known;
  const market = marketAgents.find((a) => `hired-${a.id}` === agentId);
  return {
    avgCostPerTask: market?.avgCost ?? 0,
    files: [] as AgentFile[],
    suggestions: ["¿En qué puedes ayudarme?", "Cuéntame cómo trabajas"],
  };
}

/** Aplica un cambio a la conversación del agente (creándola si no existe) y la sube al principio. */
export function touchConversation(list: Conversation[], agentId: string, update: (c: Conversation) => Conversation) {
  const current = list.find((c) => c.agentId === agentId) ?? { agentId, messages: [], unread: 0 };
  return [update(current), ...list.filter((c) => c.agentId !== agentId)];
}
