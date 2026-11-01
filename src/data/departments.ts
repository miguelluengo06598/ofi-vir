import type { AgentStatus, DepartmentId } from "@/components/glass";
import { agents, type Agent } from "./agents";

/** Orden de las tarjetas en la oficina. */
export const departmentOrder: DepartmentId[] = [
  "ventas",
  "atencion",
  "marketing",
  "operaciones",
  "direccion",
];

export type DepartmentSummary = {
  id: DepartmentId;
  agents: Agent[];
  pendingApprovals: number;
  creditsToday: number;
};

const sum = (list: Agent[], pick: (a: Agent) => number) => list.reduce((n, a) => n + pick(a), 0);

export const departmentSummaries: DepartmentSummary[] = departmentOrder.map((id) => {
  const members = agents.filter((a) => a.departmentId === id);
  return {
    id,
    agents: members,
    pendingApprovals: sum(members, (a) => a.pendingApprovals),
    creditsToday: sum(members, (a) => a.creditsToday),
  };
});

export const officeTotals = {
  agents: agents.length,
  working: agents.filter((a) => a.status === "working").length,
  pendingApprovals: sum(agents, (a) => a.pendingApprovals),
};

export type StatusFilter = "all" | Extract<AgentStatus, "working" | "waiting">;
