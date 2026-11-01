import type { DepartmentId } from "@/components/glass";
import { approvals } from "./approvals";
import type { OfficeAgent } from "./departments";
import { getAgentProfile } from "./messages";
import { movements } from "./wallet";

export type TaskStatus = "running" | "approval" | "done";

export type OfficeTask = {
  id: string;
  agentId: string;
  departmentId: DepartmentId;
  title: string;
  status: TaskStatus;
  /** Coste en créditos (estimado si la tarea no ha terminado). */
  cost: number;
  time: string;
};

/** Hora de inicio de la tarea en curso de cada agente. */
const startedAt: Record<string, string> = {
  "lucia-ramos": "09:12",
  "daniel-prieto": "10:05",
  "sofia-navarro": "08:00",
  "hugo-lara": "09:40",
  "carla-medina": "08:55",
  "nuria-campos": "09:30",
  "tomas-vidal": "10:20",
  "elena-bravo": "08:30",
};

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/**
 * Tareas de la oficina a partir del estado actual:
 * en curso (agentes que trabajan), pendientes de aprobación (aprobaciones sin resolver) y completadas hoy.
 */
export function buildTasks(agents: OfficeAgent[], resolved: ReadonlySet<string>): OfficeTask[] {
  const dept = (agentId: string) => agents.find((a) => a.id === agentId)!.departmentId;

  const running: OfficeTask[] = agents
    .filter((a) => a.status === "working")
    .map((a) => ({
      id: `run-${a.id}`,
      agentId: a.id,
      departmentId: a.departmentId,
      title: capitalize(a.currentTask),
      status: "running",
      cost: getAgentProfile(a.id).avgCostPerTask,
      time: startedAt[a.id] ? `Desde las ${startedAt[a.id]}` : "Ahora",
    }));

  const pending: OfficeTask[] = approvals
    .filter((a) => !resolved.has(a.id))
    .map((a) => ({
      id: `apr-${a.id}`,
      agentId: a.agentId,
      departmentId: a.departmentId,
      title: a.title,
      status: "approval",
      cost: a.costCredits,
      time: a.requested,
    }));

  const done: OfficeTask[] = movements
    .filter((m) => m.when.startsWith("Hoy"))
    .map((m) => ({
      id: `done-${m.id}`,
      agentId: m.agentId,
      departmentId: dept(m.agentId),
      title: m.task,
      status: "done",
      cost: m.ai + m.fee,
      time: m.when.split("· ")[1],
    }));

  return [...running, ...pending, ...done];
}
