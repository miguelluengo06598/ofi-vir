import type { LlmUsage } from "./llm.ts";
import type { Pricing } from "./pricing.ts";

/** Acceso a datos del motor. Toda operación va en el contexto de una empresa (`companyId`). */

export type AgentInfo = {
  id: string;
  slug: string;
  name: string;
  role: string;
  departmentId: string;
  departmentName: string;
  model: string;
  instructions: string;
  /** Herramientas permitidas (las que no sean del motor, como las integraciones, se ignoran). */
  allowedTools: string[];
};

export type TaskStatus = "running" | "expert" | "approval" | "done" | "failed" | "review";

export type TaskInfo = {
  id: string;
  agentId: string;
  title: string;
  status: TaskStatus;
  model: string;
  contactId: string | null;
  sourceEmailId: string | null;
  usage: LlmUsage;
  costEur: number;
  steps: number;
  reviewReason: string | null;
};

export type StepKind = "instruccion" | "respuesta" | "herramienta" | "fin";

export type NewStep = {
  step: number;
  kind: StepKind;
  content: string;
  toolName?: string;
  toolInput?: unknown;
  isError?: boolean;
  usage?: LlmUsage;
  costEur?: number;
};

export type TaskStep = Required<Pick<NewStep, "step" | "kind" | "content" | "isError" | "costEur">> & {
  position: number;
  toolName: string | null;
  toolInput: unknown;
  usage: LlmUsage;
  createdAt: string;
};

export type SourceEmail = { from: string; subject: string; text: string; occurredAt: string; contactId: string | null };

export type DraftResult = { approvalId: string; emailId: string; threadId: string; reused: boolean };
export type HandoffResult = { handoffId: string; toAgentId: string; toAgentName: string };
export type HandoffKind = "lead" | "aviso" | "peticion" | "informe";

export type TaskPatch = {
  status?: TaskStatus;
  /** Totales acumulados de la tarea. */
  usage?: LlmUsage;
  steps?: number;
  reviewReason?: string | null;
  finished?: boolean;
};

export interface AgentStore {
  getAgent(companyId: string, agentId: string): Promise<AgentInfo | null>;
  getAgentBySlug(companyId: string, slug: string): Promise<AgentInfo | null>;
  getPricing(model: string): Promise<Pricing | null>;
  listDepartments(companyId: string): Promise<{ id: string; name: string; slug: string }[]>;

  createTask(companyId: string, t: { agentId: string; title: string; model: string; contactId?: string | null }): Promise<string>;
  getTask(companyId: string, taskId: string): Promise<TaskInfo | null>;
  getSourceEmail(companyId: string, emailId: string): Promise<SourceEmail | null>;
  /** Vincula la tarea a un contacto (si aún no tiene): al borrar el contacto por RGPD se borra la tarea con sus pasos. */
  setTaskContact(companyId: string, taskId: string, contactId: string): Promise<void>;
  /** Actualiza la tarea y devuelve su coste total en euros, calculado por la base con la tarifa del modelo. */
  updateTask(companyId: string, taskId: string, patch: TaskPatch): Promise<{ costEur: number }>;
  /**
   * Reserva la tarea para ejecutarla guardando su paso 0 (la instrucción): la posición es única, así que solo una
   * ejecución lo consigue. false si la tarea ya estaba en marcha o terminada.
   */
  claimTask(companyId: string, taskId: string, instruccion: string): Promise<boolean>;

  addStep(companyId: string, taskId: string, position: number, step: NewStep): Promise<void>;
  listSteps(companyId: string, taskId: string): Promise<TaskStep[]>;

  /** Crea el borrador y su aprobación en una sola transacción. NO envía nada. */
  createDraft(companyId: string, d: { agentId: string; contactId: string; subject: string; body: string }): Promise<DraftResult>;
  createHandoff(companyId: string, h: { fromAgentId: string; toDepartmentId: string; kind: HandoffKind; summary: string; card: { label: string; value: string }[] }): Promise<HandoffResult>;
}
