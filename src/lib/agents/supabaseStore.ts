import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { LlmUsage } from "./llm.ts";
import type { Pricing } from "./pricing.ts";
import type {
  AgentInfo, AgentStore, DraftResult, HandoffKind, HandoffResult, LearnedNode, NewStep, TaskLearning, SourceEmail, TaskInfo, TaskPatch, TaskStatus, TaskStep,
} from "./store.ts";

const AGENT_COLS = "id, slug, name, role, department_id, model, instructions, allowed_tools, departments(name)";
const TASK_COLS = "id, agent_id, title, status, model, contact_id, source_email_id, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, cost_eur, steps, review_reason, memory_input_tokens, memory_output_tokens, extra_cost_eur";
const num = (v: unknown) => Number(v ?? 0);
const toLearned = (r: Record<string, unknown>): LearnedNode => ({
  id: r.id as string, type: r.node_type as string, title: r.title as string, content: r.content as string, confidence: num(r.confidence), createdAt: r.created_at as string,
});

export type PendingDraft = { approvalId: string; agentSlug: string; agentName: string; requestedAt: string; toEmail: string; toName: string; subject: string; body: string };

/**
 * Almacén del motor sobre Supabase con la clave `service_role` (solo servidor). Esa clave se salta la RLS,
 * así que CADA consulta filtra por `company_id` a mano.
 */
export class SupabaseAgentStore implements AgentStore {
  private readonly db: SupabaseClient;

  constructor(db: SupabaseClient) {
    this.db = db;
  }

  static fromEnv(): SupabaseAgentStore | null {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
    if (!url || !key) return null;
    return new SupabaseAgentStore(createClient(url, key, { auth: { persistSession: false } }));
  }

  private toAgent(r: Record<string, unknown>): AgentInfo {
    const dep = r.departments as { name?: string } | { name?: string }[] | null;
    return {
      id: r.id as string, slug: r.slug as string, name: r.name as string, role: r.role as string,
      departmentId: r.department_id as string,
      departmentName: (Array.isArray(dep) ? dep[0]?.name : dep?.name) ?? "",
      model: r.model as string, instructions: (r.instructions as string) ?? "", allowedTools: (r.allowed_tools as string[]) ?? [],
    };
  }

  async getAgent(companyId: string, agentId: string) {
    const { data, error } = await this.db.from("agents").select(AGENT_COLS).eq("company_id", companyId).eq("id", agentId).maybeSingle();
    if (error) throw new Error("No se pudo leer el agente.");
    return data ? this.toAgent(data) : null;
  }

  async getAgentBySlug(companyId: string, slug: string) {
    const { data, error } = await this.db.from("agents").select(AGENT_COLS).eq("company_id", companyId).eq("slug", slug).maybeSingle();
    if (error) throw new Error("No se pudo leer el agente.");
    return data ? this.toAgent(data) : null;
  }

  async getPricing(model: string): Promise<Pricing | null> {
    const { data, error } = await this.db.from("model_pricing").select("input_eur_per_mtok, output_eur_per_mtok, cache_read_eur_per_mtok, cache_write_eur_per_mtok").eq("model", model).maybeSingle();
    if (error) throw new Error("No se pudo leer la tarifa.");
    return data
      ? { inputEur: num(data.input_eur_per_mtok), outputEur: num(data.output_eur_per_mtok), cacheReadEur: num(data.cache_read_eur_per_mtok), cacheWriteEur: num(data.cache_write_eur_per_mtok) }
      : null;
  }

  async listDepartments(companyId: string) {
    const { data, error } = await this.db.from("departments").select("id, name, slug").eq("company_id", companyId);
    if (error) throw new Error("No se pudieron leer los departamentos.");
    return (data ?? []).map((d) => ({ id: d.id as string, name: d.name as string, slug: d.slug as string }));
  }

  async createTask(companyId: string, t: { agentId: string; title: string; model: string; contactId?: string | null }) {
    const { data, error } = await this.db
      .from("tasks")
      .insert({ company_id: companyId, agent_id: t.agentId, title: t.title, model: t.model, status: "running", contact_id: t.contactId ?? null })
      .select("id")
      .single();
    if (error || !data) throw new Error("No se pudo crear la tarea.");
    return data.id as string;
  }

  private toTask(r: Record<string, unknown>): TaskInfo {
    return {
      id: r.id as string, agentId: r.agent_id as string, title: r.title as string, status: r.status as TaskStatus, model: r.model as string,
      contactId: (r.contact_id as string | null) ?? null, sourceEmailId: (r.source_email_id as string | null) ?? null,
      usage: { inputTokens: num(r.input_tokens), outputTokens: num(r.output_tokens), cacheReadTokens: num(r.cache_read_tokens), cacheWriteTokens: num(r.cache_write_tokens) },
      costEur: num(r.cost_eur), steps: num(r.steps), reviewReason: (r.review_reason as string | null) ?? null,
      memoryUsage: { inputTokens: num(r.memory_input_tokens), outputTokens: num(r.memory_output_tokens) },
      extraCostEur: num(r.extra_cost_eur),
    };
  }

  async getTask(companyId: string, taskId: string) {
    const { data, error } = await this.db.from("tasks").select(TASK_COLS).eq("company_id", companyId).eq("id", taskId).maybeSingle();
    if (error) throw new Error("No se pudo leer la tarea.");
    return data ? this.toTask(data) : null;
  }

  async setTaskContact(companyId: string, taskId: string, contactId: string) {
    const { error } = await this.db.from("tasks").update({ contact_id: contactId }).eq("company_id", companyId).eq("id", taskId).is("contact_id", null);
    if (error) throw new Error("No se pudo vincular la tarea al contacto.");
  }

  async getSourceEmail(companyId: string, emailId: string): Promise<SourceEmail | null> {
    const { data, error } = await this.db
      .from("emails")
      .select("from_address, subject, body, occurred_at, email_threads(contact_id)")
      .eq("company_id", companyId)
      .eq("id", emailId)
      .maybeSingle();
    if (error) throw new Error("No se pudo leer el correo.");
    if (!data) return null;
    const th = data.email_threads as { contact_id?: string } | { contact_id?: string }[] | null;
    return {
      from: data.from_address as string, subject: data.subject as string, text: data.body as string, occurredAt: data.occurred_at as string,
      contactId: (Array.isArray(th) ? th[0]?.contact_id : th?.contact_id) ?? null,
    };
  }

  async updateTask(companyId: string, taskId: string, patch: TaskPatch) {
    const row: Record<string, unknown> = {};
    if (patch.status) row.status = patch.status;
    if (patch.usage) {
      row.input_tokens = patch.usage.inputTokens;
      row.output_tokens = patch.usage.outputTokens;
      row.cache_read_tokens = patch.usage.cacheReadTokens;
      row.cache_write_tokens = patch.usage.cacheWriteTokens;
    }
    if (patch.steps !== undefined) row.steps = patch.steps;
    if (patch.reviewReason !== undefined) row.review_reason = patch.reviewReason;
    if (patch.memory) {
      row.memory_input_tokens = patch.memory.inputTokens;
      row.memory_output_tokens = patch.memory.outputTokens;
      row.extra_cost_eur = patch.memory.costEur;
    }
    if (patch.finished) row.finished_at = new Date().toISOString();
    const { data, error } = await this.db.from("tasks").update(row).eq("company_id", companyId).eq("id", taskId).select("cost_eur").single();
    if (error || !data) throw new Error("No se pudo actualizar la tarea.");
    return { costEur: num(data.cost_eur) };
  }

  async claimTask(companyId: string, taskId: string, instruccion: string) {
    const { error } = await this.db.from("task_steps").insert({ company_id: companyId, task_id: taskId, position: 0, step: 0, kind: "instruccion", content: instruccion });
    if (!error) return true;
    if (error.code === "23505") return false;
    throw new Error("No se pudo reservar la tarea.");
  }

  async addStep(companyId: string, taskId: string, position: number, s: NewStep) {
    const { error } = await this.db.from("task_steps").insert({
      company_id: companyId, task_id: taskId, position, step: s.step, kind: s.kind, content: s.content,
      tool_name: s.toolName ?? null, tool_input: s.toolInput ?? null, is_error: s.isError ?? false,
      input_tokens: s.usage?.inputTokens ?? 0, output_tokens: s.usage?.outputTokens ?? 0,
      cache_read_tokens: s.usage?.cacheReadTokens ?? 0, cache_write_tokens: s.usage?.cacheWriteTokens ?? 0, cost_eur: s.costEur ?? 0,
    });
    if (error) throw new Error("No se pudo registrar el paso.");
  }

  async listSteps(companyId: string, taskId: string): Promise<TaskStep[]> {
    const { data, error } = await this.db.from("task_steps").select("*").eq("company_id", companyId).eq("task_id", taskId).order("position");
    if (error) throw new Error("No se pudieron leer los pasos.");
    return (data ?? []).map((r) => ({
      position: r.position as number, step: r.step as number, kind: r.kind as TaskStep["kind"], content: r.content as string,
      isError: r.is_error as boolean, costEur: num(r.cost_eur), toolName: (r.tool_name as string | null) ?? null, toolInput: r.tool_input ?? null,
      usage: { inputTokens: num(r.input_tokens), outputTokens: num(r.output_tokens), cacheReadTokens: num(r.cache_read_tokens), cacheWriteTokens: num(r.cache_write_tokens) } satisfies LlmUsage,
      createdAt: r.created_at as string,
    }));
  }

  async listLearned(companyId: string, taskId: string): Promise<LearnedNode[]> {
    const { data, error } = await this.db
      .from("memory_nodes")
      .select("id, node_type, title, content, confidence, created_at")
      .eq("company_id", companyId)
      .eq("source_task_id", taskId)
      .order("created_at");
    if (error) throw new Error("No se pudo leer lo aprendido.");
    return (data ?? []).map(toLearned);
  }

  async recentLearning(companyId: string, agentId: string, limitTasks: number): Promise<TaskLearning[]> {
    const { data, error } = await this.db
      .from("memory_nodes")
      .select("id, node_type, title, content, confidence, created_at, source_task_id")
      .eq("company_id", companyId)
      .eq("created_by_agent_id", agentId)
      .not("source_task_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error("No se pudo leer lo aprendido.");
    const byTask = new Map<string, LearnedNode[]>();
    for (const r of data ?? []) {
      const id = r.source_task_id as string;
      if (!byTask.has(id) && byTask.size >= limitTasks) continue;
      byTask.set(id, [...(byTask.get(id) ?? []), toLearned(r)]);
    }
    if (byTask.size === 0) return [];
    const { data: tasks, error: e2 } = await this.db.from("tasks").select("id, title, finished_at").eq("company_id", companyId).in("id", [...byTask.keys()]);
    if (e2) throw new Error("No se pudieron leer las tareas.");
    return (tasks ?? [])
      .map((t) => ({ taskId: t.id as string, taskTitle: t.title as string, finishedAt: (t.finished_at as string | null) ?? null, items: byTask.get(t.id as string)!.reverse() }))
      .sort((a, b) => (b.finishedAt ?? "").localeCompare(a.finishedAt ?? ""));
  }

  async createDraft(companyId: string, d: { agentId: string; contactId: string; subject: string; body: string }): Promise<DraftResult> {
    const { data, error } = await this.db.rpc("agent_create_email_draft", { p_company_id: companyId, p_agent_id: d.agentId, p_contact_id: d.contactId, p_subject: d.subject, p_body: d.body });
    const row = Array.isArray(data) ? data[0] : data;
    if (error || !row) throw new Error("No se pudo crear el borrador.");
    return { approvalId: row.approval_id, emailId: row.email_id, threadId: row.thread_id, reused: row.reused };
  }

  async createHandoff(companyId: string, h: { fromAgentId: string; toDepartmentId: string; kind: HandoffKind; summary: string; card: { label: string; value: string }[] }): Promise<HandoffResult> {
    const { data, error } = await this.db.rpc("agent_create_handoff", {
      p_company_id: companyId, p_from_agent: h.fromAgentId, p_to_department: h.toDepartmentId,
      p_kind: h.kind, p_summary: h.summary, p_card: h.card,
    });
    const row = Array.isArray(data) ? data[0] : data;
    if (error || !row) throw new Error("No se pudo crear el traspaso.");
    return { handoffId: row.handoff_id, toAgentId: row.to_agent_id, toAgentName: row.to_agent_name };
  }

  /** Borradores de correo creados por agentes (motor) que esperan aprobación, del más reciente al más antiguo. */
  async listPendingDrafts(companyId: string): Promise<PendingDraft[]> {
    const { data, error } = await this.db
      .from("approvals")
      .select("id, requested_at, payload, agents(slug, name)")
      .eq("company_id", companyId)
      .eq("kind", "email")
      .eq("status", "pending")
      .eq("payload->>origen", "motor")
      .order("requested_at", { ascending: false })
      .limit(50);
    if (error) throw new Error("No se pudieron leer los borradores.");
    return (data ?? []).map((r) => {
      const ag = r.agents as { slug?: string; name?: string } | { slug?: string; name?: string }[] | null;
      const agent = Array.isArray(ag) ? ag[0] : ag;
      const p = (r.payload ?? {}) as Record<string, unknown>;
      return {
        approvalId: r.id as string, agentSlug: agent?.slug ?? "", agentName: agent?.name ?? "", requestedAt: r.requested_at as string,
        toEmail: String(p.to ?? ""), toName: String(p.to_name ?? ""), subject: String(p.subject ?? ""), body: String(p.body ?? ""),
      };
    });
  }

  /** Rechaza un borrador pendiente creado por el motor. false si ya estaba resuelto o no existe. */
  async rejectDraft(companyId: string, approvalId: string, userId: string): Promise<boolean> {
    const { data, error } = await this.db
      .from("approvals")
      .update({ status: "rejected", decided_by: userId })
      .eq("company_id", companyId)
      .eq("id", approvalId)
      .eq("kind", "email")
      .eq("status", "pending")
      .select("id");
    if (error) throw new Error("No se pudo rechazar el borrador.");
    return (data?.length ?? 0) > 0;
  }
}
