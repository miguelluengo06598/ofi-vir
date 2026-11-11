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

/**
 * Por qué existe una tarea. Los agentes NUNCA trabajan por iniciativa propia: sin un origen válido el motor no ejecuta nada.
 *  - evento_externo: algo que llegó de fuera (correo, lead, WhatsApp, formulario), con la referencia del evento o del correo.
 *  - traspaso: otro agente le pasó trabajo con pasar_a_agente (tiene tarea padre; la cadena debe llevar a un origen válido).
 *  - orden_usuario: una persona lo pidió (quién y cuándo).
 *  - rutina_usuario: una rutina creada y ACTIVADA por una persona.
 *  - seguimiento_aprobado: un seguimiento propuesto por el agente y aprobado por una persona.
 */
export const ORIGENES = ["evento_externo", "traspaso", "orden_usuario", "rutina_usuario", "seguimiento_aprobado"] as const;
export type TipoOrigen = (typeof ORIGENES)[number];
/** Orígenes que pueden empezar una cadena (la raíz de cualquier traspaso tiene que ser uno de estos). */
export const ORIGENES_RAIZ: readonly TipoOrigen[] = ["evento_externo", "orden_usuario", "rutina_usuario", "seguimiento_aprobado"];

/** Lo que hay que dar al crear una tarea: el origen y su referencia obligatoria. */
export type OrigenNuevo =
  | { tipo: "evento_externo"; eventoId?: string | null; emailId?: string | null; canal: string }
  | { tipo: "traspaso"; tareaPadreId: string }
  | { tipo: "orden_usuario"; ordenadoPor: string; via?: string }
  /** Exámenes de certificación: proceso interno de MyOfia, siempre simulado y en una empresa ficticia. */
  | { tipo: "orden_usuario"; ordenadoPor: null; procesoInterno: string; solicitudId?: string | null }
  | { tipo: "rutina_usuario"; rutinaId: string }
  | { tipo: "seguimiento_aprobado"; seguimientoId: string };

/** El origen tal como queda guardado en la tarea. */
export type OrigenTarea = {
  tipo: TipoOrigen | null;
  ref: Record<string, unknown>;
  eventoId: string | null;
  tareaPadreId: string | null;
  tareaRaizId: string | null;
  ordenadoPor: string | null;
  ordenadoEn: string | null;
  rutinaId: string | null;
  seguimientoId: string | null;
};

/** Un eslabón de la cadena de una tarea (nivel 0 = la propia tarea, el último = la raíz). */
export type EslabonCadena = {
  nivel: number; taskId: string; agentId: string; origen: TipoOrigen | null; tareaPadreId: string | null;
  eventoId: string | null; sourceEmailId: string | null; ordenadoPor: string | null; rutinaId: string | null; seguimientoId: string | null;
  esSimulacion: boolean; ref: Record<string, unknown>; title: string; startedAt: string;
};

/** Interruptores que se consultan antes de cada llamada al modelo. */
export type ControlEjecucion = { paradaEmergencia: boolean; motivoParada: string | null; oficinaPausada: boolean };

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
  /** Por qué existe la tarea (ver `TipoOrigen`). */
  origen: OrigenTarea;
  esSimulacion: boolean;
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

  /** Crea una tarea «en marcha» sin ejecutar. El origen es obligatorio (la base lo vuelve a exigir). */
  createTask(companyId: string, t: { agentId: string; title: string; model: string; origen: OrigenNuevo; contactId?: string | null; esSimulacion?: boolean; instruccionEntrada?: string | null }): Promise<string>;
  /** La cadena de la tarea hasta su raíz (tarea padre → … → origen). */
  cadenaDeTarea(companyId: string, taskId: string): Promise<EslabonCadena[]>;
  /** Parada de emergencia global y pausa de la oficina. */
  controlDeEjecucion(companyId: string): Promise<ControlEjecucion>;
  /** Anota que la puerta de ejecución bloqueó una tarea (una vez por tarea, motivo y fase). */
  registrarBloqueo(companyId: string, b: { taskId: string; agentId: string | null; codigo: string; motivo: string; fase: "inicio" | "paso" }): Promise<void>;
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
  /**
   * Tareas en marcha que aún no se han ejecutado y que procesa la cola (eventos externos, traspasos, rutinas, seguimientos).
   * Nunca las de una oficina pausada ni con la parada de emergencia. Las órdenes de una persona no entran: se ejecutan al pedirlas.
   */
  listarTareasPendientes(o?: { companyId?: string; limite?: number }): Promise<{ companyId: string; taskId: string }[]>;
  /** Otros correos agrupados en la misma tarea (varios mensajes seguidos de la misma persona). */
  correosAgrupados(companyId: string, taskId: string): Promise<SourceEmail[]>;

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
