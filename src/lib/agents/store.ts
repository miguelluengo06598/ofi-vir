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

/** `scheduled` = aplazada: llegó fuera de horario y se procesará al abrir (reglas del agente). */
export type TaskStatus = "running" | "expert" | "approval" | "done" | "failed" | "review" | "scheduled";

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
  /** El contenido externo traía órdenes ocultas (o el modelo intentó salirse de sus permisos). */
  suspicious: boolean;
  /** Tokens y coste (€) del paso de memoria al terminar, ya incluidos en `costEur`. */
  memoryUsage: { inputTokens: number; outputTokens: number };
  extraCostEur: number;
  /** Lo que recibe un agente destino como entrada (la ficha del traspaso). null en el resto de tareas. */
  instruccionEntrada: string | null;
  /** Traspaso que originó la tarea (si nació de uno). */
  handoffId: string | null;
};

export type StepKind = "instruccion" | "respuesta" | "herramienta" | "memoria" | "fin";

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
  suspicious?: boolean;
  /** Paso de memoria: tokens y coste en euros (con la tarifa de su modelo), que se suma al coste de la tarea. */
  memory?: { inputTokens: number; outputTokens: number; costEur: number };
};

/** Un recuerdo que un agente guardó al terminar una tarea. */
export type LearnedNode = { id: string; type: string; title: string; content: string; confidence: number; createdAt: string };
export type TaskLearning = { taskId: string; taskTitle: string; finishedAt: string | null; items: LearnedNode[] };

export interface AgentStore {
  getAgent(companyId: string, agentId: string): Promise<AgentInfo | null>;
  getAgentBySlug(companyId: string, slug: string): Promise<AgentInfo | null>;
  getPricing(model: string): Promise<Pricing | null>;
  listDepartments(companyId: string): Promise<{ id: string; name: string; slug: string }[]>;

  createTask(companyId: string, t: { agentId: string; title: string; model: string; contactId?: string | null; esSimulacion?: boolean }): Promise<string>;
  getTask(companyId: string, taskId: string): Promise<TaskInfo | null>;
  getSourceEmail(companyId: string, emailId: string): Promise<SourceEmail | null>;
  /** Vincula la tarea a un contacto (si aún no tiene): al borrar el contacto por RGPD se borra la tarea con sus pasos. */
  setTaskContact(companyId: string, taskId: string, contactId: string): Promise<void>;
  /** Anota con qué instrucciones y versión del agente se ejecutó la tarea (hash de las instrucciones y partes recortadas). */
  registrarInstrucciones(companyId: string, taskId: string, r: { hash: string; agentVersion: number; recortes: { parte: string; antes: number; despues: number }[] }): Promise<void>;
  /** Actualiza la tarea y devuelve su coste total en euros, calculado por la base con la tarifa del modelo. */
  updateTask(companyId: string, taskId: string, patch: TaskPatch): Promise<{ costEur: number }>;
  /**
   * Reserva la tarea para ejecutarla guardando su paso 0 (la instrucción): la posición es única, así que solo una
   * ejecución lo consigue. false si la tarea ya estaba en marcha o terminada.
   */
  claimTask(companyId: string, taskId: string, instruccion: string): Promise<boolean>;

  /** Aplaza la tarea hasta `hasta` (fuera de horario con «no responder»): guarda la instrucción (null si la tarea nació de un correo, que ya está guardado) para procesarla al abrir. */
  aplazarTarea(companyId: string, taskId: string, a: { hasta: Date; instruccion: string | null }): Promise<void>;
  /** Tareas aplazadas cuya hora ya llegó (de todas las empresas, o solo de una). */
  listarAplazadasVencidas(ahora: Date, o?: { companyId?: string; limite?: number }): Promise<{ companyId: string; taskId: string }[]>;
  /** Reanuda una aplazada (vuelve a «en marcha»). Atómico: solo un proceso la consigue; null si ya no toca o no existe. Devuelve la instrucción guardada. */
  reanudarAplazada(companyId: string, taskId: string, ahora: Date): Promise<{ instruccion: string | null } | null>;

  /** Estado de un traspaso según avanza la tarea del agente destino. */
  actualizarTraspaso(companyId: string, handoffId: string, status: "received" | "in_progress" | "done" | "rejected"): Promise<void>;
  /** Tareas nacidas de un traspaso que aún no se han ejecutado. */
  listarTareasDeTraspasoPendientes(o?: { companyId?: string; limite?: number }): Promise<{ companyId: string; taskId: string }[]>;

  addStep(companyId: string, taskId: string, position: number, step: NewStep): Promise<void>;
  listSteps(companyId: string, taskId: string): Promise<TaskStep[]>;
  /** Recuerdos guardados al terminar una tarea. */
  listLearned(companyId: string, taskId: string): Promise<LearnedNode[]>;
  /** Lo aprendido en las últimas tareas de un agente (solo tareas que guardaron algo). */
  recentLearning(companyId: string, agentId: string, limitTasks: number): Promise<TaskLearning[]>;

  /** Crea el borrador y su aprobación en una sola transacción. NO envía nada. */
  createDraft(companyId: string, d: { agentId: string; contactId: string; subject: string; body: string }): Promise<DraftResult>;
  createHandoff(companyId: string, h: { fromAgentId: string; toDepartmentId: string; kind: HandoffKind; summary: string; card: { label: string; value: string }[]; contactId?: string | null }): Promise<HandoffResult>;
}
