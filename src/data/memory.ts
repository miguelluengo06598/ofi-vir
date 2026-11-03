import type { DepartmentId } from "@/components/glass";
import { agentById } from "./agents";

/** Tipos de nodo de la red de conocimiento. */
export type NodeType = "contacto" | "empresa" | "campana" | "correo" | "dato" | "tarea" | "agente";

/** Tipos de conexión. La conexión se lee «origen <tipo> destino»: «Laura trabaja en Clínica Sol». */
export type EdgeKind = "trabaja_en" | "llego_por" | "recibio" | "respondio" | "tiene_pendiente" | "creado_por";

export const nodeTypeOrder: NodeType[] = ["contacto", "empresa", "campana", "correo", "dato", "tarea", "agente"];

export const nodeTypeLabel: Record<NodeType, { singular: string; plural: string }> = {
  contacto: { singular: "Contacto", plural: "Contactos" },
  empresa: { singular: "Empresa", plural: "Empresas" },
  campana: { singular: "Campaña", plural: "Campañas" },
  correo: { singular: "Correo", plural: "Correos" },
  dato: { singular: "Dato", plural: "Datos" },
  tarea: { singular: "Tarea", plural: "Tareas" },
  agente: { singular: "Agente", plural: "Agentes" },
};

export const edgeKindLabel: Record<EdgeKind, string> = {
  trabaja_en: "trabaja en",
  llego_por: "llegó por",
  recibio: "recibió",
  respondio: "respondió",
  tiene_pendiente: "tiene pendiente",
  creado_por: "creado por",
};

export type MemoryEvent = { at: string; text: string };

export type MemoryNode = {
  id: string;
  /** Racimo (cliente) al que pertenece. Los agentes se repiten en cada racimo donde han trabajado. */
  clientId: string;
  type: NodeType;
  label: string;
  /** Qué es, en una o dos frases. */
  detail: string;
  /** Fecha ISO de creación. */
  createdAt: string;
  /** Agente que lo creó (para un nodo de tipo agente, él mismo). */
  creatorId: string;
  /** Hechos posteriores a la creación, en cualquier orden. */
  events: MemoryEvent[];
};

export type MemoryEdge = { id: string; from: string; to: string; kind: EdgeKind };

/** Un cliente = un racimo de la red. */
export type MemoryClient = {
  id: string;
  /** Nombre del contacto principal. */
  name: string;
  company: string;
  /** Última actividad (ISO); decide qué racimos se muestran por defecto. */
  lastActivity: string;
};

export type MemoryData = { clients: MemoryClient[]; nodes: MemoryNode[]; edges: MemoryEdge[] };

/** Departamento de un nodo: el del agente que lo creó. */
export const nodeDepartment = (node: MemoryNode): DepartmentId => agentById(node.creatorId).departmentId;

// ——— Datos de ejemplo ———

type NodeInit = Omit<MemoryNode, "clientId" | "events"> & { events?: MemoryEvent[] };

const buildCluster = (clientId: string, nodes: NodeInit[], links: [string, EdgeKind, string][]) => {
  const out: MemoryNode[] = nodes.map((n) => ({ ...n, clientId, events: n.events ?? [] }));
  // Un nodo de agente por cada agente que aparece como creador en el racimo.
  const creators = [...new Set(out.map((n) => n.creatorId))];
  const agentNodes: MemoryNode[] = creators.map((id) => {
    const a = agentById(id);
    const made = out.filter((n) => n.creatorId === id);
    return {
      id: `${clientId}-ag-${id}`,
      clientId,
      type: "agente",
      label: a.name,
      detail: `${a.role} · creado por ${a.creator}. En este cliente ha generado ${made.length} ${made.length === 1 ? "elemento" : "elementos"}.`,
      createdAt: made.map((m) => m.createdAt).sort()[0],
      creatorId: id,
      events: [],
    };
  });
  const edges: MemoryEdge[] = [
    ...links.map(([from, kind, to], i) => ({ id: `${clientId}-e${i}`, from, to, kind })),
    ...out.map((n) => ({
      id: `${clientId}-c-${n.id}`,
      from: n.id,
      to: `${clientId}-ag-${n.creatorId}`,
      kind: "creado_por" as const,
    })),
  ];
  return { nodes: [...out, ...agentNodes], edges };
};

const laura = buildCluster(
  "laura",
  [
    {
      id: "laura-contacto",
      type: "contacto",
      label: "Laura Gómez",
      detail: "Directora de Clínica Sol y contacto principal. Llegó desde un anuncio de Meta Ads y tiene una propuesta pendiente de envío.",
      createdAt: "2026-10-21T09:12:00",
      creatorId: "daniel-prieto",
      events: [
        { at: "2026-10-21T09:20:00", text: "Cualificada con 82 de 100 puntos: clínica de tamaño medio con presupuesto." },
        { at: "2026-10-24T10:05:00", text: "Recibió el primer correo de seguimiento de Lucía Ramos." },
        { at: "2026-10-27T16:40:00", text: "Respondió al correo con una objeción de precio." },
        { at: "2026-11-03T10:15:00", text: "Irene Soler preparó la propuesta de 4.200 € y espera tu aprobación." },
      ],
    },
    {
      id: "laura-empresa",
      type: "empresa",
      label: "Clínica Sol",
      detail: "Clínica dental en Chamberí (Madrid) con 14 empleados y 3 gabinetes. Sin gestor de reservas online.",
      createdAt: "2026-10-21T09:30:00",
      creatorId: "nuria-campos",
      events: [{ at: "2026-10-22T08:00:00", text: "Ficha completada en el CRM con web, teléfono y número de empleados." }],
    },
    {
      id: "laura-campana",
      type: "campana",
      label: "Clínicas dentales – Madrid",
      detail: "Campaña de Meta Ads dirigida a clínicas dentales de Madrid. Ha generado 12 leads con buen perfil y 1 venta.",
      createdAt: "2026-10-06T11:00:00",
      creatorId: "alvaro-rios",
      events: [{ at: "2026-10-30T12:30:00", text: "Los leads de esta campaña convierten el doble que la media." }],
    },
    {
      id: "laura-correo1",
      type: "correo",
      label: "Seguimiento del plan anual",
      detail: "Primer seguimiento enviado por Lucía: presenta el plan anual y propone una llamada de 15 minutos.",
      createdAt: "2026-10-24T10:05:00",
      creatorId: "lucia-ramos",
      events: [{ at: "2026-10-24T11:48:00", text: "Abierto por Laura Gómez." }],
    },
    {
      id: "laura-correo2",
      type: "correo",
      label: "Respuesta de Laura",
      detail: "«Nos interesa, pero el precio nos parece alto comparado con la oferta que ya tenemos.»",
      createdAt: "2026-10-27T16:40:00",
      creatorId: "hugo-lara",
      events: [{ at: "2026-10-27T16:42:00", text: "Clasificado como respuesta comercial con objeción y reenviado a Ventas." }],
    },
    {
      id: "laura-dato1",
      type: "dato",
      label: "Objeción: precio",
      detail: "Considera caro el plan anual de 4.200 € y lo compara con otra oferta de 3.500 €.",
      createdAt: "2026-10-27T16:45:00",
      creatorId: "lucia-ramos",
    },
    {
      id: "laura-dato2",
      type: "dato",
      label: "Presupuesto: 3.500–4.500 €",
      detail: "Rango indicado en el formulario de cualificación para digitalizar reservas y recordatorios.",
      createdAt: "2026-10-21T09:18:00",
      creatorId: "daniel-prieto",
    },
    {
      id: "laura-dato3",
      type: "dato",
      label: "Prefiere llamadas por la tarde",
      detail: "Atiende pacientes por la mañana: contactar a partir de las 16:00.",
      createdAt: "2026-10-21T09:19:00",
      creatorId: "daniel-prieto",
    },
    {
      id: "laura-tarea1",
      type: "tarea",
      label: "Propuesta de 4.200 €",
      detail: "Propuesta del plan anual lista para enviar. Espera tu aprobación en la vista Aprobaciones.",
      createdAt: "2026-11-03T10:15:00",
      creatorId: "irene-soler",
    },
    {
      id: "laura-tarea2",
      type: "tarea",
      label: "Llamada de seguimiento",
      detail: "Llamar el jueves por la tarde para resolver la duda de precio antes de enviar la propuesta.",
      createdAt: "2026-10-28T09:00:00",
      creatorId: "lucia-ramos",
    },
  ],
  [
    ["laura-contacto", "trabaja_en", "laura-empresa"],
    ["laura-contacto", "llego_por", "laura-campana"],
    ["laura-contacto", "recibio", "laura-correo1"],
    ["laura-contacto", "respondio", "laura-correo2"],
    ["laura-contacto", "respondio", "laura-dato1"],
    ["laura-contacto", "respondio", "laura-dato2"],
    ["laura-contacto", "respondio", "laura-dato3"],
    ["laura-contacto", "tiene_pendiente", "laura-tarea1"],
    ["laura-contacto", "tiene_pendiente", "laura-tarea2"],
  ],
);

const javier = buildCluster(
  "javier",
  [
    {
      id: "javier-contacto",
      type: "contacto",
      label: "Javier Ortega",
      detail: "Gerente de Reformas Ortega. Se suscribió al boletín de otoño y contrató el plan trimestral.",
      createdAt: "2026-10-14T12:05:00",
      creatorId: "daniel-prieto",
      events: [
        { at: "2026-10-16T09:30:00", text: "Recibió la propuesta de 2.800 €." },
        { at: "2026-10-28T11:10:00", text: "Aceptó la propuesta: cliente activo." },
        { at: "2026-10-30T17:20:00", text: "Preguntó por el IVA y los plazos de pago." },
      ],
    },
    {
      id: "javier-empresa",
      type: "empresa",
      label: "Reformas Ortega",
      detail: "Empresa de reformas integrales en Valencia con 9 empleados.",
      createdAt: "2026-10-14T12:20:00",
      creatorId: "nuria-campos",
    },
    {
      id: "javier-campana",
      type: "campana",
      label: "Boletín de otoño",
      detail: "Boletín con casos de reformas de otoño. Superó su objetivo de clics en un 18 %.",
      createdAt: "2026-10-02T10:00:00",
      creatorId: "carla-medina",
    },
    {
      id: "javier-correo1",
      type: "correo",
      label: "Propuesta de 2.800 €",
      detail: "Propuesta del plan trimestral con calendario de pagos, enviada tras tu aprobación.",
      createdAt: "2026-10-16T09:30:00",
      creatorId: "irene-soler",
    },
    {
      id: "javier-correo2",
      type: "correo",
      label: "Duda sobre IVA y pagos",
      detail: "Pregunta si el precio incluye IVA y si puede pagar a 30 días.",
      createdAt: "2026-10-30T17:20:00",
      creatorId: "hugo-lara",
      events: [{ at: "2026-10-30T17:22:00", text: "Clasificado como consulta de facturación." }],
    },
    {
      id: "javier-dato1",
      type: "dato",
      label: "Plan trimestral",
      detail: "Contratado el 28 de octubre por 2.800 € más IVA.",
      createdAt: "2026-10-28T11:15:00",
      creatorId: "tomas-vidal",
    },
    {
      id: "javier-dato2",
      type: "dato",
      label: "Pago por transferencia a 30 días",
      detail: "Forma de pago acordada con la empresa.",
      createdAt: "2026-10-28T11:20:00",
      creatorId: "tomas-vidal",
    },
    {
      id: "javier-tarea1",
      type: "tarea",
      label: "Factura de 2.800 €",
      detail: "Emitir la factura del plan trimestral en el cierre de mes.",
      createdAt: "2026-10-28T11:25:00",
      creatorId: "tomas-vidal",
    },
    {
      id: "javier-tarea2",
      type: "tarea",
      label: "Responder duda del IVA",
      detail: "Confirmar que el precio no incluye IVA y que la transferencia a 30 días ya está acordada.",
      createdAt: "2026-10-30T17:25:00",
      creatorId: "hugo-lara",
    },
  ],
  [
    ["javier-contacto", "trabaja_en", "javier-empresa"],
    ["javier-contacto", "llego_por", "javier-campana"],
    ["javier-contacto", "recibio", "javier-correo1"],
    ["javier-contacto", "respondio", "javier-correo2"],
    ["javier-contacto", "respondio", "javier-dato1"],
    ["javier-contacto", "respondio", "javier-dato2"],
    ["javier-contacto", "tiene_pendiente", "javier-tarea1"],
    ["javier-contacto", "tiene_pendiente", "javier-tarea2"],
  ],
);

const marta = buildCluster(
  "marta",
  [
    {
      id: "marta-contacto",
      type: "contacto",
      label: "Marta Ibáñez",
      detail: "Socia de Ibáñez & Asociados. Pidió una demo de atención automática para su despacho.",
      createdAt: "2026-10-29T15:40:00",
      creatorId: "daniel-prieto",
      events: [
        { at: "2026-10-30T09:00:00", text: "Recibió la invitación a una demo de 20 minutos." },
        { at: "2026-11-02T13:15:00", text: "Preguntó cómo se protegen los datos de sus clientes." },
      ],
    },
    {
      id: "marta-empresa",
      type: "empresa",
      label: "Ibáñez & Asociados",
      detail: "Despacho de abogados en Zaragoza con 6 profesionales. Atiende unas 40 consultas al mes.",
      createdAt: "2026-10-29T15:50:00",
      creatorId: "nuria-campos",
    },
    {
      id: "marta-campana",
      type: "campana",
      label: "Despachos profesionales",
      detail: "Campaña de LinkedIn dirigida a despachos y asesorías de más de 5 profesionales.",
      createdAt: "2026-10-19T10:00:00",
      creatorId: "alvaro-rios",
    },
    {
      id: "marta-correo",
      type: "correo",
      label: "Invitación a la demo",
      detail: "Correo de Lucía con tres huecos para una demo de 20 minutos.",
      createdAt: "2026-10-30T09:00:00",
      creatorId: "lucia-ramos",
    },
    {
      id: "marta-dato1",
      type: "dato",
      label: "Interés: atender consultas",
      detail: "Quiere automatizar la primera respuesta a las consultas que llegan por la web.",
      createdAt: "2026-10-29T15:45:00",
      creatorId: "daniel-prieto",
    },
    {
      id: "marta-dato2",
      type: "dato",
      label: "Objeción: protección de datos",
      detail: "Necesita garantías de cumplimiento del RGPD y de secreto profesional antes de seguir.",
      createdAt: "2026-11-02T13:20:00",
      creatorId: "sofia-navarro",
    },
    {
      id: "marta-tarea",
      type: "tarea",
      label: "Enviar documento de seguridad",
      detail: "Enviar el resumen de seguridad y RGPD de los agentes certificados.",
      createdAt: "2026-11-02T13:30:00",
      creatorId: "sofia-navarro",
    },
  ],
  [
    ["marta-contacto", "trabaja_en", "marta-empresa"],
    ["marta-contacto", "llego_por", "marta-campana"],
    ["marta-contacto", "recibio", "marta-correo"],
    ["marta-contacto", "respondio", "marta-dato1"],
    ["marta-contacto", "respondio", "marta-dato2"],
    ["marta-contacto", "tiene_pendiente", "marta-tarea"],
  ],
);

export const memoryClients: MemoryClient[] = [
  { id: "laura", name: "Laura Gómez", company: "Clínica Sol", lastActivity: "2026-11-03T10:15:00" },
  { id: "marta", name: "Marta Ibáñez", company: "Ibáñez & Asociados", lastActivity: "2026-11-02T13:30:00" },
  { id: "javier", name: "Javier Ortega", company: "Reformas Ortega", lastActivity: "2026-10-30T17:25:00" },
];

export const memoryNodes: MemoryNode[] = [...laura.nodes, ...javier.nodes, ...marta.nodes];
export const memoryEdges: MemoryEdge[] = [...laura.edges, ...javier.edges, ...marta.edges];

/** Copia nueva de los datos de ejemplo (la vista los modifica al corregir o borrar). */
export const initialMemory = (): MemoryData => ({
  clients: memoryClients.map((c) => ({ ...c })),
  nodes: memoryNodes.map((n) => ({ ...n, events: n.events.map((e) => ({ ...e })) })),
  edges: memoryEdges.map((e) => ({ ...e })),
});
