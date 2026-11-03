import type { DepartmentId } from "@/components/glass";

export type HandoffKind = "lead" | "aviso" | "peticion" | "informe";
export type HandoffStatus = "sent" | "received" | "inProgress" | "done" | "rejected";

export const kindLabel: Record<HandoffKind, string> = {
  lead: "Lead",
  aviso: "Aviso",
  peticion: "Petición",
  informe: "Informe",
};

export const handoffStatusLabel: Record<HandoffStatus, string> = {
  sent: "Enviado",
  received: "Recibido",
  inProgress: "En curso",
  done: "Completado",
  rejected: "Rechazado",
};

/** Traspaso: mensaje con formato fijo de un agente a otro. */
export type Handoff = {
  id: string;
  chainId: string;
  fromAgentId: string;
  fromDepartmentId: DepartmentId;
  toAgentId: string;
  toDepartmentId: DepartmentId;
  kind: HandoffKind;
  /** Resumen de una línea. */
  summary: string;
  /** Texto de la burbuja que aparece en la tarjeta de destino al llegar. */
  bubble: string;
  /** Ficha con los datos que se pasan. */
  card: { label: string; value: string }[];
  status: HandoffStatus;
  time: string;
  /** Coste en créditos. */
  credits: number;
  /** Si es sensible, la aprobación que genera (vista Aprobaciones). */
  approvalId?: string;
};

/** Cadena: secuencia de traspasos que persigue un objetivo. */
export type Chain = {
  id: string;
  title: string;
  goal: string;
  handoffs: Handoff[];
};

type Step = Omit<Handoff, "chainId" | "fromDepartmentId" | "toDepartmentId">;

// Agente → departamento (los traspasos solo guardan los ids de agente; el departamento se deduce de aquí).
const dept: Record<string, DepartmentId> = {
  "lucia-ramos": "ventas",
  "daniel-prieto": "ventas",
  "sofia-navarro": "atencion",
  "carla-medina": "marketing",
  "alvaro-rios": "marketing",
  "nuria-campos": "operaciones",
  "tomas-vidal": "operaciones",
  "elena-bravo": "direccion",
};

function chain(id: string, title: string, goal: string, steps: Step[]): Chain {
  return {
    id,
    title,
    goal,
    handoffs: steps.map((s) => ({ ...s, chainId: id, fromDepartmentId: dept[s.fromAgentId], toDepartmentId: dept[s.toAgentId] })),
  };
}

export const chains: Chain[] = [
  chain(
    "cadena-clinicas",
    "De un anuncio a una venta",
    "Convertir los leads de la campaña «Clínicas dentales – Madrid» en clientes y decidir si merece más presupuesto.",
    [
      {
        id: "h-clinicas-1",
        fromAgentId: "alvaro-rios",
        toAgentId: "lucia-ramos",
        kind: "lead",
        summary: "12 leads con buen perfil de la campaña «Clínicas dentales – Madrid»",
        bubble: "Lucía recibió 12 leads de Álvaro",
        card: [
          { label: "Campaña", value: "Clínicas dentales – Madrid (Meta Ads)" },
          { label: "Leads", value: "12 con buen perfil (clínicas de 2 a 6 sillones)" },
          { label: "Coste por lead", value: "7,40 €" },
          { label: "Interés declarado", value: "Gestión de citas y recordatorios por WhatsApp" },
        ],
        status: "done",
        time: "09:05",
        credits: 0.9,
      },
      {
        id: "h-clinicas-2",
        fromAgentId: "lucia-ramos",
        toAgentId: "sofia-navarro",
        kind: "peticion",
        summary: "Atender por WhatsApp las respuestas de los leads contactados",
        bubble: "Sofía recibió una petición de Lucía",
        card: [
          { label: "Primer mensaje enviado", value: "«Hola, vimos que te interesó el anuncio sobre gestión de citas. ¿Te cuento cómo lo usan otras clínicas de Madrid?»" },
          { label: "Canal", value: "WhatsApp Business" },
          { label: "Leads contactados", value: "12" },
        ],
        status: "done",
        time: "09:40",
        credits: 1.2,
      },
      {
        id: "h-clinicas-3",
        fromAgentId: "sofia-navarro",
        toAgentId: "lucia-ramos",
        kind: "lead",
        summary: "Un lead pregunta precios: conversación resumida para Ventas",
        bubble: "Lucía recibió un lead de Sofía",
        card: [
          { label: "Contacto", value: "Clínica Sol · Laura Gómez" },
          { label: "Resumen", value: "Pregunta por el precio del plan anual y si hay permanencia. Tiene 4 sillones y 2 recepcionistas." },
          { label: "Siguiente paso", value: "Enviar propuesta y proponer llamada el jueves" },
        ],
        status: "done",
        time: "10:12",
        credits: 0.7,
      },
      {
        id: "h-clinicas-4",
        fromAgentId: "lucia-ramos",
        toAgentId: "nuria-campos",
        kind: "peticion",
        summary: "Actualizar en el CRM las 12 fichas con el primer contacto",
        bubble: "Nuria recibió una petición de Lucía",
        card: [
          { label: "Fichas", value: "12 (estado: contactado; 1 en negociación)" },
          { label: "Etiqueta", value: "Campaña · Clínicas dentales – Madrid" },
          { label: "Notas", value: "Añadir resumen de la conversación de WhatsApp en Laura Gómez" },
        ],
        status: "done",
        time: "10:30",
        credits: 0.6,
      },
      {
        id: "h-clinicas-5",
        fromAgentId: "lucia-ramos",
        toAgentId: "alvaro-rios",
        kind: "informe",
        summary: "Venta cerrada: los leads de esta campaña convierten el doble que la media",
        bubble: "Álvaro recibió el informe de Lucía",
        card: [
          { label: "Venta", value: "Clínica Sol · plan anual · 4.200 €" },
          { label: "Conversión de la campaña", value: "16 % frente al 8 % de media" },
          { label: "Tiempo hasta el cierre", value: "5 días" },
        ],
        status: "done",
        time: "11:48",
        credits: 0.5,
      },
      {
        id: "h-clinicas-6",
        fromAgentId: "alvaro-rios",
        toAgentId: "elena-bravo",
        kind: "peticion",
        summary: "Propone subir un 30 % el presupuesto de la campaña (requiere tu aprobación)",
        bubble: "Elena recibió una propuesta de Álvaro",
        card: [
          { label: "Cambio", value: "900 € → 1.170 € al mes (+30 %)" },
          { label: "Motivo", value: "Conversión doble que la media y coste por lead estable" },
          { label: "Riesgo", value: "Bajo: se revisa el viernes con los resultados" },
        ],
        status: "inProgress",
        time: "12:02",
        credits: 0.8,
        approvalId: "apr-presupuesto-clinicas",
      },
      {
        id: "h-clinicas-7",
        fromAgentId: "nuria-campos",
        toAgentId: "elena-bravo",
        kind: "informe",
        summary: "Resumen de la cadena para el informe semanal",
        bubble: "Elena recibió el resumen de la cadena",
        card: [
          { label: "Cadena", value: "De un anuncio a una venta" },
          { label: "Resultado", value: "12 leads · 1 venta de 4.200 € · coste total de la cadena 5,0 créditos" },
          { label: "Destino", value: "Informe semanal de dirección" },
        ],
        status: "received",
        time: "12:15",
        credits: 0.3,
      },
    ],
  ),
  chain(
    "cadena-cobro",
    "Cobro duplicado resuelto",
    "Corregir un cobro duplicado reclamado por una clienta y evitar que se repita.",
    [
      {
        id: "h-cobro-1",
        fromAgentId: "sofia-navarro",
        toAgentId: "tomas-vidal",
        kind: "peticion",
        summary: "Revisar un cobro duplicado de 89 € a una clienta del plan Pro",
        bubble: "Tomás recibió una petición de Sofía",
        card: [
          { label: "Cliente", value: "Marta Olmos · plan Pro" },
          { label: "Importe", value: "89 € cobrados dos veces el 28/10" },
          { label: "Canal", value: "Chat web" },
        ],
        status: "done",
        time: "10:20",
        credits: 0.6,
      },
      {
        id: "h-cobro-2",
        fromAgentId: "tomas-vidal",
        toAgentId: "sofia-navarro",
        kind: "aviso",
        summary: "Reembolso de 89 € emitido; la clienta lo verá en 3-5 días",
        bubble: "Sofía recibió un aviso de Tomás",
        card: [
          { label: "Reembolso", value: "89 € a la tarjeta original" },
          { label: "Causa", value: "Reintento automático de la pasarela" },
          { label: "Plazo", value: "3-5 días laborables" },
        ],
        status: "done",
        time: "10:44",
        credits: 0.4,
      },
      {
        id: "h-cobro-3",
        fromAgentId: "sofia-navarro",
        toAgentId: "elena-bravo",
        kind: "informe",
        summary: "Segunda reclamación de facturación esta semana",
        bubble: "Elena recibió un informe de Sofía",
        card: [
          { label: "Reclamaciones", value: "2 esta semana (ambas por cobros duplicados)" },
          { label: "Importe devuelto", value: "178 €" },
          { label: "Recomendación", value: "Revisar los reintentos de la pasarela de pago" },
        ],
        status: "received",
        time: "11:05",
        credits: 0.3,
      },
    ],
  ),
  chain(
    "cadena-boletin",
    "Del boletín a nuevas oportunidades",
    "Aprovechar las respuestas al boletín de octubre para generar oportunidades de venta.",
    [
      {
        id: "h-boletin-1",
        fromAgentId: "carla-medina",
        toAgentId: "daniel-prieto",
        kind: "aviso",
        summary: "8 suscriptores del boletín han pedido una demo",
        bubble: "Daniel recibió un aviso de Carla",
        card: [
          { label: "Origen", value: "Boletín de octubre · botón «Pide una demo»" },
          { label: "Contactos", value: "8 (3 con empresa de más de 20 personas)" },
        ],
        status: "done",
        time: "09:15",
        credits: 0.4,
      },
      {
        id: "h-boletin-2",
        fromAgentId: "daniel-prieto",
        toAgentId: "nuria-campos",
        kind: "peticion",
        summary: "Dar de alta en el CRM los 8 contactos con su puntuación",
        bubble: "Nuria recibió una petición de Daniel",
        card: [
          { label: "Contactos", value: "8 nuevos" },
          { label: "Puntuación media", value: "72 / 100" },
          { label: "Propietario", value: "Lucía Ramos" },
        ],
        status: "inProgress",
        time: "09:50",
        credits: 0.5,
      },
      {
        id: "h-boletin-3",
        fromAgentId: "carla-medina",
        toAgentId: "alvaro-rios",
        kind: "peticion",
        summary: "Convertir el boletín en un anuncio de remarketing",
        bubble: "Álvaro rechazó la petición de Carla",
        card: [
          { label: "Pieza", value: "Boletín de octubre · versión corta" },
          { label: "Motivo del rechazo", value: "El presupuesto de remarketing está agotado hasta diciembre" },
        ],
        status: "rejected",
        time: "10:05",
        credits: 0.2,
      },
    ],
  ),
];

/** Todos los traspasos en el orden en que se reproducen (cadena a cadena). */
export const allHandoffs: Handoff[] = chains.flatMap((c) => c.handoffs);

export const chainById = (id: string) => chains.find((c) => c.id === id)!;
export const chainCost = (c: Chain) => c.handoffs.reduce((n, h) => n + h.credits, 0);

/** Pares de departamentos que se comunican (sin dirección), para las líneas en reposo. */
export function connectedPairs(): [DepartmentId, DepartmentId][] {
  const seen = new Map<string, [DepartmentId, DepartmentId]>();
  for (const h of allHandoffs) {
    if (h.fromDepartmentId === h.toDepartmentId) continue;
    const pair = [h.fromDepartmentId, h.toDepartmentId].sort() as [DepartmentId, DepartmentId];
    seen.set(pair.join("|"), pair);
  }
  return [...seen.values()];
}
