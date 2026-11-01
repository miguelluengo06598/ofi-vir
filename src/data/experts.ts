/** Persona experta de cada creador, a quien se puede consultar un caso. */
export type Expert = {
  /** Nombre de la empresa creadora (coincide con `agent.creator`). */
  company: string;
  name: string;
  title: "creador" | "creadora";
  /** Tiempo medio de respuesta, en horas. */
  avgResponseHours: number;
  /** Precio de la consulta, en créditos. */
  price: number;
};

export const experts: Record<string, Expert> = {
  "Estudio Cálamo": { company: "Estudio Cálamo", name: "Ana Martín", title: "creadora", avgResponseHours: 4, price: 12 },
  Leadforge: { company: "Leadforge", name: "Raúl Vega", title: "creador", avgResponseHours: 3, price: 9 },
  "Helpdesk Labs": { company: "Helpdesk Labs", name: "Inés Ortuño", title: "creadora", avgResponseHours: 2, price: 8 },
  "Verbo Studio": { company: "Verbo Studio", name: "Julián Cabrera", title: "creador", avgResponseHours: 6, price: 10 },
  "Flujo Ops": { company: "Flujo Ops", name: "Elisa Pardo", title: "creadora", avgResponseHours: 3, price: 7 },
  "Atalaya Analytics": { company: "Atalaya Analytics", name: "Óscar Beltrán", title: "creador", avgResponseHours: 8, price: 15 },
  Rankwise: { company: "Rankwise", name: "Natalia Ferrer", title: "creadora", avgResponseHours: 5, price: 11 },
  "Opinia Labs": { company: "Opinia Labs", name: "David Millán", title: "creador", avgResponseHours: 3, price: 6 },
};

export const expertFor = (creator: string): Expert | undefined => experts[creator];

/** Consulta abierta con el experto de un agente. */
export type Consultation = {
  id: string;
  agentId: string;
  /** Quién la inició: el propio agente al escalar un caso, o la empresa. */
  origin: "agent" | "company";
  problem: string;
  price: number;
  estimatedHours: number;
};

/** Hugo ya había escalado un caso por su cuenta. */
export const initialConsultations: Consultation[] = [
  {
    id: "consulta-hugo",
    agentId: "hugo-lara",
    origin: "agent",
    problem: "Reclamación de facturación con un cobro duplicado que no sabe resolver con seguridad",
    price: 8,
    estimatedHours: 2,
  },
];

export const hours = (n: number) => `${n} h`;
