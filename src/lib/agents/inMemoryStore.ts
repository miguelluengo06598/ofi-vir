import { randomUUID } from "node:crypto";
import type { LlmUsage } from "./llm.ts";
import { costeEur, USO_VACIO, type Pricing } from "./pricing.ts";
import type {
  AgentInfo, AgentStore, DraftResult, HandoffKind, HandoffResult, NewStep, SourceEmail, TaskInfo, TaskPatch, TaskStep,
} from "./store.ts";

/** Almacén en memoria para los tests: misma forma que el de Supabase, sin base de datos. */
export class InMemoryAgentStore implements AgentStore {
  agents: AgentInfo[] = [];
  departments: { id: string; name: string; slug: string }[] = [];
  pricing = new Map<string, Pricing>();
  tasks = new Map<string, TaskInfo & { companyId: string }>();
  steps = new Map<string, TaskStep[]>();
  emails = new Map<string, SourceEmail>();
  drafts: { companyId: string; agentId: string; contactId: string; subject: string; body: string; approvalId: string }[] = [];
  handoffs: { companyId: string; fromAgentId: string; toAgentId: string; toDepartmentId: string; kind: HandoffKind; summary: string; card: { label: string; value: string }[] }[] = [];

  async getAgent(_c: string, id: string) { return this.agents.find((a) => a.id === id) ?? null; }
  async getAgentBySlug(_c: string, slug: string) { return this.agents.find((a) => a.slug === slug) ?? null; }
  async getPricing(model: string) { return this.pricing.get(model) ?? null; }
  async listDepartments() { return this.departments; }

  async createTask(companyId: string, t: { agentId: string; title: string; model: string; contactId?: string | null }) {
    const id = randomUUID();
    this.tasks.set(id, {
      companyId, id, agentId: t.agentId, title: t.title, status: "running", model: t.model, contactId: t.contactId ?? null, sourceEmailId: null,
      usage: USO_VACIO, costEur: 0, steps: 0, reviewReason: null, suspicious: false, memoryUsage: { inputTokens: 0, outputTokens: 0 }, extraCostEur: 0,
    });
    return id;
  }
  private own(companyId: string, taskId: string) {
    const t = this.tasks.get(taskId);
    return t && t.companyId === companyId ? t : null;
  }
  async getTask(companyId: string, taskId: string): Promise<TaskInfo | null> { return this.own(companyId, taskId); }
  async setTaskContact(companyId: string, taskId: string, contactId: string) {
    const t = this.own(companyId, taskId);
    if (t && !t.contactId) t.contactId = contactId;
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
