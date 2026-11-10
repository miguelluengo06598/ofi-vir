import { randomUUID } from "node:crypto";
import type { LlmUsage } from "./llm.ts";
import { costeEur, USO_VACIO, type Pricing } from "./pricing.ts";
import type {
  AgentInfo, AgentStore, ControlEjecucion, DraftResult, EslabonCadena, HandoffKind, HandoffResult, NewStep, OrigenNuevo, SourceEmail, TaskInfo, TaskPatch, TaskStep,
} from "./store.ts";
import { origenGuardado } from "./origen.ts";

/** Almacén en memoria para los tests: misma forma que el de Supabase, sin base de datos. */
export class InMemoryAgentStore implements AgentStore {
  agents: AgentInfo[] = [];
  departments: { id: string; name: string; slug: string }[] = [];
  pricing = new Map<string, Pricing>();
  tasks = new Map<string, TaskInfo & { companyId: string }>();
  steps = new Map<string, TaskStep[]>();
  instrucciones = new Map<string, { hash: string; agentVersion: number; recortes: { parte: string; antes: number; despues: number }[] }>();
  emails = new Map<string, SourceEmail>();
  drafts: { companyId: string; agentId: string; contactId: string; subject: string; body: string; approvalId: string }[] = [];
  handoffs: { companyId: string; fromAgentId: string; toAgentId: string; toDepartmentId: string; kind: HandoffKind; summary: string; card: { label: string; value: string }[] }[] = [];

  async getAgent(_c: string, id: string) { return this.agents.find((a) => a.id === id) ?? null; }
  async getAgentBySlug(_c: string, slug: string) { return this.agents.find((a) => a.slug === slug) ?? null; }
  async getPricing(model: string) { return this.pricing.get(model) ?? null; }
  async listDepartments() { return this.departments; }

  async createTask(companyId: string, t: { agentId: string; title: string; model: string; origen: OrigenNuevo; contactId?: string | null; esSimulacion?: boolean; instruccionEntrada?: string | null }) {
    const id = randomUUID();
    const origen = origenGuardado(t.origen);
    // Mismas reglas que la base (tasks_origen_validar): un traspaso tiene padre en la empresa y nunca es del mismo agente.
    if (origen.tipo === "traspaso") {
      const padre = this.own(companyId, origen.tareaPadreId!);
      if (!padre) throw new Error("ORIGEN_INVALIDO: la tarea padre no existe en esta empresa");
      if (padre.agentId === t.agentId) throw new Error("AUTOENCARGO: un agente no puede pasarse trabajo a sí mismo");
      origen.tareaRaizId = padre.origen.tareaRaizId ?? padre.id;
    } else origen.tareaRaizId = id;
    this.tasks.set(id, {
      companyId, id, agentId: t.agentId, title: t.title, status: "running", model: t.model, contactId: t.contactId ?? null,
      sourceEmailId: t.origen.tipo === "evento_externo" ? t.origen.emailId ?? null : null,
      usage: USO_VACIO, costEur: 0, steps: 0, reviewReason: null, suspicious: false, memoryUsage: { inputTokens: 0, outputTokens: 0 }, extraCostEur: 0,
      instruccionEntrada: t.instruccionEntrada ?? null, handoffId: null, origen, esSimulacion: t.esSimulacion ?? false,
    });
    return id;
  }
  /** Para los tests: una tarea «antigua» o manipulada, sin pasar por las comprobaciones de `createTask`. */
  insertarTareaCruda(companyId: string, t: Partial<TaskInfo> & { agentId: string }) {
    const id = t.id ?? randomUUID();
    this.tasks.set(id, {
      companyId, id, title: "Tarea", status: "running", model: "claude-haiku-5-5", contactId: null, sourceEmailId: null, usage: USO_VACIO, costEur: 0, steps: 0,
      reviewReason: null, suspicious: false, memoryUsage: { inputTokens: 0, outputTokens: 0 }, extraCostEur: 0, instruccionEntrada: null, handoffId: null, esSimulacion: false,
      origen: { tipo: null, ref: {}, eventoId: null, tareaPadreId: null, tareaRaizId: null, ordenadoPor: null, ordenadoEn: null, rutinaId: null, seguimientoId: null },
      ...t,
    });
    return id;
  }
  async cadenaDeTarea(companyId: string, taskId: string): Promise<EslabonCadena[]> {
    const out: EslabonCadena[] = [];
    let t = this.own(companyId, taskId);
    for (let nivel = 0; t && nivel <= 50; nivel++) {
      out.push({
        nivel, taskId: t.id, agentId: t.agentId, origen: t.origen.tipo, tareaPadreId: t.origen.tareaPadreId, eventoId: t.origen.eventoId, sourceEmailId: t.sourceEmailId,
        ordenadoPor: t.origen.ordenadoPor, rutinaId: t.origen.rutinaId, seguimientoId: t.origen.seguimientoId, esSimulacion: t.esSimulacion, ref: t.origen.ref, title: t.title,
        startedAt: new Date().toISOString(),
      });
      if (t.origen.tipo !== "traspaso" && t.origen.tipo !== "seguimiento_aprobado") break;
      t = t.origen.tareaPadreId ? this.own(companyId, t.origen.tareaPadreId) : null;
    }
    return out;
  }
  control: ControlEjecucion = { paradaEmergencia: false, motivoParada: null, oficinaPausada: false };
  async controlDeEjecucion() { return { ...this.control }; }
  bloqueos: { companyId: string; taskId: string; agentId: string | null; codigo: string; motivo: string; fase: "inicio" | "paso" }[] = [];
  async registrarBloqueo(companyId: string, b: { taskId: string; agentId: string | null; codigo: string; motivo: string; fase: "inicio" | "paso" }) {
    if (!this.bloqueos.some((x) => x.taskId === b.taskId && x.codigo === b.codigo && x.fase === b.fase)) this.bloqueos.push({ companyId, ...b });
  }
  agrupados = new Map<string, SourceEmail[]>();
  async correosAgrupados(_c: string, taskId: string) { return this.agrupados.get(taskId) ?? []; }
  private own(companyId: string, taskId: string) {
    const t = this.tasks.get(taskId);
    return t && t.companyId === companyId ? t : null;
  }
  async getTask(companyId: string, taskId: string): Promise<TaskInfo | null> { return this.own(companyId, taskId); }
  async setTaskContact(companyId: string, taskId: string, contactId: string) {
    const t = this.own(companyId, taskId);
    if (t && !t.contactId) t.contactId = contactId;
  }
  async registrarInstrucciones(companyId: string, taskId: string, r: { hash: string; agentVersion: number; recortes: { parte: string; antes: number; despues: number }[] }) {
    if (!this.own(companyId, taskId)) throw new Error("Tarea no encontrada");
    this.instrucciones.set(taskId, r);
  }
  async getSourceEmail(_c: string, emailId: string) { return this.emails.get(emailId) ?? null; }

  async updateTask(companyId: string, taskId: string, patch: TaskPatch) {
    const t = this.own(companyId, taskId);
    if (!t) throw new Error("Tarea no encontrada");
    if (patch.status) t.status = patch.status;
    if (patch.usage) t.usage = patch.usage as LlmUsage;
    if (patch.steps !== undefined) t.steps = patch.steps;
    if (patch.reviewReason !== undefined) t.reviewReason = patch.reviewReason;
    if (patch.suspicious !== undefined) t.suspicious = patch.suspicious;
    if (patch.memory) {
      t.memoryUsage = { inputTokens: patch.memory.inputTokens, outputTokens: patch.memory.outputTokens };
      t.extraCostEur = patch.memory.costEur;
    }
    const p = this.pricing.get(t.model);
    t.costEur = Math.round(((p ? costeEur(t.usage, p) : 0) + t.extraCostEur) * 1e6) / 1e6;
    return { costEur: t.costEur };
  }

  traspasos = new Map<string, string>();
  async actualizarTraspaso(_c: string, handoffId: string, status: string) { this.traspasos.set(handoffId, status); }
  async listarTareasPendientes(o: { companyId?: string; limite?: number } = {}) {
    if (this.control.paradaEmergencia || this.control.oficinaPausada) return [];
    const DE_LA_COLA = ["evento_externo", "traspaso", "rutina_usuario", "seguimiento_aprobado"];
    return [...this.tasks.values()]
      .filter((t) => DE_LA_COLA.includes(t.origen.tipo ?? "") && !t.esSimulacion && t.status === "running" && (!o.companyId || t.companyId === o.companyId) && !(this.steps.get(t.id) ?? []).some((s) => s.position === 0))
      .slice(0, o.limite ?? 50).map((t) => ({ companyId: t.companyId, taskId: t.id }));
  }
  aplazadas = new Map<string, { hasta: Date; instruccion: string | null }>();
  async aplazarTarea(companyId: string, taskId: string, a: { hasta: Date; instruccion: string | null }) {
    const t = this.own(companyId, taskId);
    if (!t) throw new Error("Tarea no encontrada");
    t.status = "scheduled";
    this.aplazadas.set(taskId, a);
  }
  async listarAplazadasVencidas(ahora: Date, o: { companyId?: string; limite?: number } = {}) {
    return [...this.tasks.values()]
      .filter((t) => t.status === "scheduled" && (!o.companyId || t.companyId === o.companyId) && (this.aplazadas.get(t.id)?.hasta.getTime() ?? Infinity) <= ahora.getTime())
      .slice(0, o.limite ?? 100).map((t) => ({ companyId: t.companyId, taskId: t.id }));
  }
  async reanudarAplazada(companyId: string, taskId: string, ahora: Date) {
    const t = this.own(companyId, taskId), a = this.aplazadas.get(taskId);
    if (!t || !a || t.status !== "scheduled" || a.hasta.getTime() > ahora.getTime()) return null;
    t.status = "running";
    this.aplazadas.delete(taskId);
    return { instruccion: a.instruccion };
  }

  async claimTask(companyId: string, taskId: string, instruccion: string) {
    if (!this.own(companyId, taskId)) return false;
    const list = this.steps.get(taskId) ?? [];
    if (list.some((s) => s.position === 0)) return false;
    await this.addStep(companyId, taskId, 0, { step: 0, kind: "instruccion", content: instruccion });
    return true;
  }
  async addStep(companyId: string, taskId: string, position: number, s: NewStep) {
    if (!this.own(companyId, taskId)) throw new Error("Tarea no encontrada");
    const list = this.steps.get(taskId) ?? [];
    list.push({
      position, step: s.step, kind: s.kind, content: s.content, isError: s.isError ?? false, costEur: s.costEur ?? 0,
      toolName: s.toolName ?? null, toolInput: s.toolInput ?? null, usage: s.usage ?? USO_VACIO, createdAt: new Date().toISOString(),
    });
    this.steps.set(taskId, list);
  }
  async listSteps(companyId: string, taskId: string) {
    return this.own(companyId, taskId) ? [...(this.steps.get(taskId) ?? [])].sort((a, b) => a.position - b.position) : [];
  }

  async listLearned() { return []; }
  async recentLearning() { return []; }

  async createDraft(companyId: string, d: { agentId: string; contactId: string; subject: string; body: string }): Promise<DraftResult> {
    const same = this.drafts.find((x) => x.companyId === companyId && x.agentId === d.agentId && x.contactId === d.contactId && x.subject === d.subject && x.body === d.body);
    if (same) return { approvalId: same.approvalId, emailId: same.approvalId, threadId: same.approvalId, reused: true };
    const approvalId = randomUUID();
    this.drafts.push({ companyId, ...d, approvalId });
    return { approvalId, emailId: randomUUID(), threadId: randomUUID(), reused: false };
  }
  async createHandoff(companyId: string, h: { fromAgentId: string; toDepartmentId: string; kind: HandoffKind; summary: string; card: { label: string; value: string }[] }): Promise<HandoffResult> {
    const to = this.agents.find((a) => a.departmentId === h.toDepartmentId && a.id !== h.fromAgentId);
    if (!to) throw new Error("sin agente");
    this.handoffs.push({ companyId, fromAgentId: h.fromAgentId, toAgentId: to.id, toDepartmentId: h.toDepartmentId, kind: h.kind, summary: h.summary, card: h.card });
    return { handoffId: randomUUID(), toAgentId: to.id, toAgentName: to.name };
  }
}
