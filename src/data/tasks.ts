import type { DepartmentId } from "@/components/glass";
import { approvals } from "./approvals";
import type { Consultation } from "./experts";
import type { OfficeAgent } from "./departments";
import { getAgentProfile } from "./messages";
import { movements } from "./wallet";

export type TaskStatus = "running" | "expert" | "approval" | "done";

export type OfficeTask = {
  id: string;
  agentId: string;
  departmentId: DepartmentId;
  title: string;
  status: TaskStatus;
  /** Coste en créditos (estimado si la tarea no ha terminado). */
  cost: number;
  time: string;
  /** Por qué empezó la tarea: los agentes nunca trabajan por iniciativa propia. */
  porque?: string;
};

/** Motivo de la tarea en curso de cada agente (ejemplo): un evento, un traspaso, una orden o una rutina activada por una persona. */
const porqueEmpezo: Record<string, string> = {
  "lucia-ramos": "Traspaso de Daniel",
  "daniel-prieto": "Formulario de la web",
  "sofia-navarro": "Chat de la web",
  "hugo-lara": "Correo recibido",
  "carla-medina": "Orden de Marcos",
  "nuria-campos": "Traspaso de Lucía",
  "tomas-vidal": "Rutina: facturación de fin de mes",
  "elena-bravo": "Rutina: informe de los lunes",
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
export function buildTasks(
  agents: OfficeAgent[],
  resolved: ReadonlySet<string>,
  consultations: Consultation[],
): OfficeTask[] {
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
      porque: porqueEmpezo[a.id],
    }));

  const withExpert: OfficeTask[] = consultations.map((c) => ({
    id: `exp-${c.id}`,
    agentId: c.agentId,
    departmentId: dept(c.agentId),
    title: `Consulta al experto: ${c.problem}`,
    status: "expert",
    cost: c.price,
    time: `Respuesta estimada: ${c.estimatedHours} h`,
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

  return [...running, ...withExpert, ...pending, ...done];
}
