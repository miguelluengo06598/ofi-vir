import type { AgentStatus, DepartmentId } from "@/components/glass";
import { agents, type Agent } from "./agents";
import { approvals, type Approval } from "./approvals";
import { expertFor, type Consultation } from "./experts";
import { marketAgents } from "./marketplace";

/** Agente del marketplace contratado y asignado a un departamento. */
export type HiredAgent = { marketId: string; departmentId: DepartmentId };

export const hiredAgentId = (marketId: string) => `hired-${marketId}`;

function hiredToAgent({ marketId, departmentId }: HiredAgent): Agent {
  const m = marketAgents.find((a) => a.id === marketId)!;
  return {
    id: hiredAgentId(marketId),
    name: m.name,
    role: m.role,
    departmentId,
    status: "working",
    task: "configurando sus herramientas en tu oficina",
    tools: m.tools,
    creator: m.creator,
    creditsToday: 0,
  };
}

/** Orden de las tarjetas en la oficina. */
export const departmentOrder: DepartmentId[] = [
  "ventas",
  "atencion",
  "marketing",
  "operaciones",
  "direccion",
];

export const departmentInfo: Record<
  DepartmentId,
  { description: string; metrics: { label: string; value: string }[] }
> = {
  ventas: {
    description: "Cualifica leads, prepara propuestas y hace seguimiento comercial hasta el cierre.",
    metrics: [
      { label: "Leads atendidos hoy", value: "37" },
      { label: "Tasa de respuesta", value: "92 %" },
    ],
  },
  atencion: {
    description: "Atiende consultas por chat y correo y escala a una persona los casos complejos.",
    metrics: [
      { label: "Consultas resueltas hoy", value: "64" },
      { label: "Tiempo medio de respuesta", value: "2 min" },
    ],
  },
  marketing: {
    description: "Planifica campañas, redacta contenidos y analiza sus resultados.",
    metrics: [
      { label: "Piezas publicadas esta semana", value: "11" },
      { label: "Clics de campaña hoy", value: "1.280" },
    ],
  },
  operaciones: {
    description: "Mantiene el CRM al día y automatiza la facturación y los pedidos.",
    metrics: [
      { label: "Registros actualizados hoy", value: "120" },
      { label: "Facturas emitidas", value: "6" },
    ],
  },
  direccion: {
    description: "Resume la actividad semanal y avisa de desviaciones de gasto.",
    metrics: [
      { label: "Informes enviados este mes", value: "4" },
      { label: "Alertas de gasto abiertas", value: "1" },
    ],
  },
};

/** Agente con los datos que dependen de las aprobaciones aún sin resolver. */
export type OfficeAgent = Agent & {
  pendingApprovals: number;
  currentTask: string;
  /** Consulta abierta con el experto de su creador, si la hay. */
  consultation?: Consultation;
};

export type DepartmentSummary = {
  id: DepartmentId;
  agents: OfficeAgent[];
  pending: Approval[];
  pendingApprovals: number;
  creditsToday: number;
};

const sum = <T,>(list: T[], pick: (item: T) => number) => list.reduce((n, item) => n + pick(item), 0);

/** Estado de la oficina dadas las aprobaciones ya resueltas: un agente en espera vuelve a trabajar al quedarse sin pendientes. */
export function buildOffice(
  resolved: ReadonlySet<string>,
  hired: HiredAgent[] = [],
  consultations: Consultation[] = [],
) {
  const pending = approvals.filter((a) => !resolved.has(a.id));
  const officeAgents: OfficeAgent[] = [...agents, ...hired.map(hiredToAgent)].map((a) => {
    const count = pending.filter((p) => p.agentId === a.id).length;
    const resumed = a.status === "waiting" && count === 0;
    const consultation = consultations.find((c) => c.agentId === a.id);
    const expert = consultation && expertFor(a.creator);
    if (consultation && expert) {
      return {
        ...a,
        pendingApprovals: count,
        status: "expert",
        currentTask: `esperando la respuesta de su ${expert.title}, ${expert.name} (≈ ${consultation.estimatedHours} h)`,
        consultation,
      };
    }
    return {
      ...a,
      pendingApprovals: count,
      status: resumed ? "working" : a.status,
      currentTask: resumed ? (a.resumedTask ?? a.task) : a.task,
    };
  });

  const summaries: DepartmentSummary[] = departmentOrder.map((id) => {
    const members = officeAgents.filter((a) => a.departmentId === id);
    const own = pending.filter((p) => p.departmentId === id);
    return {
      id,
      agents: members,
      pending: own,
      pendingApprovals: own.length,
      creditsToday: sum(members, (a) => a.creditsToday),
    };
  });

  return {
    summaries,
    totals: {
      agents: officeAgents.length,
      working: officeAgents.filter((a) => a.status === "working").length,
      pendingApprovals: pending.length,
    },
  };
}

export type StatusFilter = "all" | Extract<AgentStatus, "working" | "waiting">;
