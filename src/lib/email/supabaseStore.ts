import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { InboundEmailData, InboundStore, InboxReader, LiveMessage, ThreadRef } from "./inboundStore.ts";
import type { ChainHeaders, ClaimResult, DeliveryStatus, DeliveryTarget, EmailStore, OutboundEmail } from "./store.ts";

const likeExact = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);
const EMAIL_COLS = "id, company_id, thread_id, subject, body, to_address, delivery_status, attachments, approval_id, resend_message_id";

/**
 * Almacén de correo sobre Supabase con la clave `service_role` (solo servidor). Esa clave se salta la RLS,
 * así que CADA consulta filtra por `company_id` a mano (salvo `findByResendId`, que parte del id único de Resend).
 */
export class SupabaseEmailStore implements EmailStore, InboundStore, InboxReader {
  private readonly db: SupabaseClient;

  constructor(db: SupabaseClient) {
    this.db = db;
  }

  static fromEnv(): SupabaseEmailStore | null {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
    if (!url || !key) return null;
    return new SupabaseEmailStore(createClient(url, key, { auth: { persistSession: false } }));
  }

  private async hydrate(row: Record<string, unknown>): Promise<OutboundEmail | null> {
    const companyId = row.company_id as string;
    const { data: thread } = await this.db.from("email_threads").select("agent_id, contact_id").eq("company_id", companyId).eq("id", row.thread_id as string).maybeSingle();
    if (!thread) return null;
    const [{ data: agent }, { data: approval }] = await Promise.all([
      this.db.from("agents").select("id, slug, name, daily_email_limit").eq("company_id", companyId).eq("id", thread.agent_id as string).maybeSingle(),
      row.approval_id
        ? this.db.from("approvals").select("id, status, kind, content_sha256").eq("company_id", companyId).eq("id", row.approval_id as string).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    if (!agent) return null;
    return {
      id: row.id as string,
      companyId,
      threadId: row.thread_id as string,
      subject: row.subject as string,
      body: row.body as string,
      toAddress: row.to_address as string,
      deliveryStatus: row.delivery_status as string,
      hasAttachments: Array.isArray(row.attachments) && row.attachments.length > 0,
      agent: { id: agent.id as string, slug: agent.slug as string, name: agent.name as string, dailyLimit: agent.daily_email_limit as number },
      contactId: thread.contact_id as string,
      approval: approval
        ? { id: approval.id as string, status: approval.status as "pending" | "approved" | "rejected", kind: approval.kind as string, contentSha256: (approval.content_sha256 as string | null) ?? null }
        : null,
    };
  }

  async getEmail(companyId: string, emailId: string): Promise<OutboundEmail | null> {
    const { data, error } = await this.db.from("emails").select(EMAIL_COLS).eq("company_id", companyId).eq("id", emailId).eq("direction", "outbound").maybeSingle();
    if (error) throw new Error("No se pudo leer el correo.");
    return data ? this.hydrate(data) : null;
  }

  async findDraft(companyId: string, agentSlug: string, toAddress: string): Promise<OutboundEmail | null> {
    const { data, error } = await this.db
      .from("emails")
      .select(EMAIL_COLS)
      .eq("company_id", companyId)
      .eq("direction", "outbound")
      .eq("delivery_status", "pending_approval")
      .ilike("to_address", likeExact(toAddress.trim()))
      .order("occurred_at", { ascending: false })
      .limit(10);
    if (error) throw new Error("No se pudo buscar el borrador.");
    for (const row of data ?? []) {
      const email = await this.hydrate(row);
      if (email?.agent.slug === agentSlug) return email;
    }
    return null;
  }

  async sentToday(companyId: string, agentId: string): Promise<number> {
    const { data, error } = await this.db.rpc("agent_emails_sent_today", { p_company_id: companyId, p_agent_id: agentId });
    if (error) throw new Error("No se pudo contar los correos de hoy.");
    return Number(data ?? 0);
  }

  async chainHeaders(companyId: string, threadId: string): Promise<ChainHeaders> {
    const { data, error } = await this.db
      .from("emails")
      .select("message_id_header, references_headers")
      .eq("company_id", companyId)
      .eq("thread_id", threadId)
      .not("message_id_header", "is", null)
      .order("occurred_at", { ascending: false })
      .limit(1);
    if (error) throw new Error("No se pudieron leer las cabeceras del hilo.");
    const last = data?.[0];
    return last ? { inReplyTo: last.message_id_header as string, references: (last.references_headers as string[] | null) ?? [] } : { inReplyTo: null, references: [] };
  }

  async approveDraft(companyId: string, approvalId: string, userId: string, text: { subject: string; body: string }): Promise<void> {
    const { error } = await this.db.rpc("approve_email_draft", {
      p_company_id: companyId, p_approval_id: approvalId, p_user_id: userId, p_subject: text.subject, p_body: text.body,
    });
    if (error) throw new Error(error.code === "23514" ? error.message : "No se pudo registrar la aprobación.");
  }

  async claimForSend(companyId: string, emailId: string, d: { fromAddress: string; messageId: string; inReplyTo: string | null; references: string[] }): Promise<ClaimResult> {
    const { data, error } = await this.db
      .from("emails")
      .update({ delivery_status: "sent", from_address: d.fromAddress, message_id_header: d.messageId, in_reply_to: d.inReplyTo, references_headers: d.references, occurred_at: new Date().toISOString() })
      .eq("company_id", companyId)
      .eq("id", emailId)
      .eq("direction", "outbound")
      .eq("delivery_status", "pending_approval")
      .select("id");
    // 23514: el disparador de la base rechazó el envío (sin aprobación, texto distinto o límite diario). Su mensaje es seguro.
    if (error) return { ok: false, reason: "rechazado", message: error.code === "23514" ? error.message : "No se pudo reservar el envío." };
    if (!data || data.length === 0) return { ok: false, reason: "ya_reclamado", message: "Este correo ya se está enviando o se envió." };
    return { ok: true };
  }

  async releaseClaim(companyId: string, emailId: string): Promise<void> {
    await this.db
      .from("emails")
      .update({ delivery_status: "pending_approval", message_id_header: null, in_reply_to: null, references_headers: [] })
      .eq("company_id", companyId)
      .eq("id", emailId)
      .eq("delivery_status", "sent")
      .is("resend_message_id", null);
  }

  async recordSent(companyId: string, emailId: string, threadId: string, resendId: string): Promise<void> {
    const { error } = await this.db.from("emails").update({ resend_message_id: resendId }).eq("company_id", companyId).eq("id", emailId);
    if (error) throw new Error("No se pudo guardar el id de Resend.");
    await this.db.from("email_threads").update({ status: "sent", status_note: null, last_message_at: new Date().toISOString() }).eq("company_id", companyId).eq("id", threadId);
  }

  async findByResendId(resendId: string): Promise<DeliveryTarget | null> {
    const { data: email, error } = await this.db.from("emails").select("id, company_id, thread_id, to_address, delivery_status").eq("resend_message_id", resendId).maybeSingle();
    if (error) throw new Error("No se pudo buscar el correo.");
    if (!email) return null;
    const companyId = email.company_id as string;
    const { data: thread } = await this.db.from("email_threads").select("contact_id, agent_id, status").eq("company_id", companyId).eq("id", email.thread_id as string).maybeSingle();
    if (!thread) return null;
    const { data: contact } = await this.db.from("contacts").select("name, email").eq("company_id", companyId).eq("id", thread.contact_id as string).maybeSingle();
    if (!contact) return null;
    return {
      companyId,
      emailId: email.id as string,
      threadId: email.thread_id as string,
      contactId: thread.contact_id as string,
      contactName: contact.name as string,
      contactEmail: contact.email as string,
      agentId: thread.agent_id as string,
      toAddress: email.to_address as string,
      deliveryStatus: email.delivery_status as string,
      threadStatus: thread.status as string,
    };
  }

  async updateDelivery(t: DeliveryTarget, status: DeliveryStatus, note: string | null): Promise<void> {
    const { error } = await this.db.from("emails").update({ delivery_status: status }).eq("company_id", t.companyId).eq("id", t.emailId);
    if (error) throw new Error("No se pudo actualizar el estado del correo.");
    // Un hilo ya respondido conserva su estado; el aviso queda en el correo.
    if (t.threadStatus !== "replied") {
      const { error: e2 } = await this.db.from("email_threads").update({ status, status_note: note }).eq("company_id", t.companyId).eq("id", t.threadId);
      if (e2) throw new Error("No se pudo actualizar el estado del hilo.");
    }
  }

  // --- Recepción ------------------------------------------------------------------------------------------------

  private async threadRef(companyId: string, threadId: string): Promise<ThreadRef | null> {
    const { data: t } = await this.db.from("email_threads").select("subject, contact_id, agent_id").eq("company_id", companyId).eq("id", threadId).maybeSingle();
    if (!t) return null;
    const [{ data: c }, { data: a }] = await Promise.all([
      this.db.from("contacts").select("name, email").eq("company_id", companyId).eq("id", t.contact_id as string).maybeSingle(),
      this.db.from("agents").select("slug, name, model").eq("company_id", companyId).eq("id", t.agent_id as string).maybeSingle(),
    ]);
    if (!c || !a) return null;
    return {
      companyId, threadId, subject: t.subject as string, contactId: t.contact_id as string, contactName: c.name as string, contactEmail: c.email as string,
      agentId: t.agent_id as string, agentSlug: a.slug as string, agentName: a.name as string, agentModel: a.model as string,
    };
  }

  async findInboundByResendId(resendId: string) {
    const { data, error } = await this.db.from("emails").select("id, company_id, thread_id").eq("resend_message_id", resendId).eq("direction", "inbound").maybeSingle();
    if (error) throw new Error("No se pudo buscar el correo recibido.");
    if (!data) return null;
    const thread = await this.threadRef(data.company_id as string, data.thread_id as string);
    return thread ? { emailId: data.id as string, thread } : null;
  }

  async findThreadByMessageIds(messageIds: string[]): Promise<ThreadRef | null> {
    // Solo ids sin comas, comillas ni paréntesis: así van seguros dentro del filtro.
    const ids = messageIds.filter((m) => /^<[A-Za-z0-9._%+\-=@$!#&*\/^~]{1,300}>$/.test(m)).slice(0, 20);
    if (ids.length === 0) return null;
    const { data, error } = await this.db.from("emails").select("company_id, thread_id, message_id_header").in("message_id_header", ids);
    if (error) throw new Error("No se pudo buscar el hilo por cabeceras.");
    for (const id of ids) {
      const row = (data ?? []).find((r) => r.message_id_header === id);
      if (row) return this.threadRef(row.company_id as string, row.thread_id as string);
    }
    return null;
  }

  async findLatestThreadForAddress(companyId: string, address: string): Promise<ThreadRef | null> {
    const contact = await this.findContactByEmail(companyId, address);
    if (!contact) return null;
    const { data } = await this.db.from("email_threads").select("id").eq("company_id", companyId).eq("contact_id", contact.id).order("last_message_at", { ascending: false }).limit(1);
    return data?.[0] ? this.threadRef(companyId, data[0].id as string) : null;
  }

  async findContactByEmail(companyId: string, email: string) {
    const { data, error } = await this.db.from("contacts").select("id, name, email").eq("company_id", companyId).eq("email", email.trim().toLowerCase()).maybeSingle();
    if (error) throw new Error("No se pudo buscar el contacto.");
    return data ? { id: data.id as string, name: data.name as string, email: data.email as string } : null;
  }

  async createContact(companyId: string, c: { name: string; email: string }) {
    const email = c.email.trim().toLowerCase();
    const { data, error } = await this.db.from("contacts").insert({ company_id: companyId, name: c.name.slice(0, 200), email }).select("id, name, email").single();
    if (data) return { id: data.id as string, name: data.name as string, email: data.email as string };
    if (error?.code === "23505") {
      const existing = await this.findContactByEmail(companyId, email);
      if (existing) return existing;
    }
    throw new Error("No se pudo crear el contacto.");
  }

  async findAgentBySlug(companyId: string, slug: string) {
    const { data, error } = await this.db.from("agents").select("id, slug, name, model").eq("company_id", companyId).eq("slug", slug).maybeSingle();
    if (error) throw new Error("No se pudo buscar el agente.");
    return data ? { id: data.id as string, slug: data.slug as string, name: data.name as string, model: data.model as string } : null;
  }

  async createThread(companyId: string, t: { contactId: string; agentId: string; subject: string }) {
    const { data, error } = await this.db
      .from("email_threads")
      .insert({ company_id: companyId, contact_id: t.contactId, agent_id: t.agentId, subject: t.subject.slice(0, 300), status: "replied" })
      .select("id")
      .single();
    if (error || !data) throw new Error("No se pudo crear el hilo.");
    return data.id as string;
  }

  async insertInbound(companyId: string, threadId: string, e: InboundEmailData): Promise<string> {
    const row = {
      company_id: companyId, thread_id: threadId, direction: "inbound", delivery_status: "received",
      from_address: e.fromAddress, to_address: e.toAddress || "(sin destinatario)", subject: e.subject.slice(0, 500), body: e.body,
      attachments: e.attachments.map((a) => ({ name: a.filename, size: a.size })), resend_message_id: e.resendId,
      message_id_header: e.messageId, in_reply_to: e.inReplyTo, references_headers: e.references, occurred_at: e.occurredAt, ingested_at: new Date().toISOString(),
    };
    let { data, error } = await this.db.from("emails").insert(row).select("id").single();
    if (error?.code === "23505") {
      // Mismo correo de Resend ya guardado (aviso repetido o en paralelo): se devuelve el existente.
      const dup = await this.findInboundByResendId(e.resendId);
      if (dup) return dup.emailId;
      // Message-ID repetido con otro id de Resend: se guarda sin él para no perder el correo.
      ({ data, error } = await this.db.from("emails").insert({ ...row, message_id_header: null }).select("id").single());
    }
    if (error || !data) throw new Error("No se pudo guardar el correo recibido.");
    return data.id as string;
  }

  async markThreadReplied(companyId: string, threadId: string, at: string): Promise<void> {
    const { error } = await this.db.from("email_threads").update({ status: "replied", status_note: null, last_message_at: at }).eq("company_id", companyId).eq("id", threadId);
    if (error) throw new Error("No se pudo actualizar el hilo.");
  }

  async ensureTask(companyId: string, t: { agentId: string; emailId: string; title: string; model: string }) {
    const { data, error } = await this.db
      .from("tasks")
      .insert({ company_id: companyId, agent_id: t.agentId, title: t.title, status: "running", model: t.model, source_email_id: t.emailId })
      .select("id")
      .single();
    if (data) return { taskId: data.id as string, created: true };
    if (error?.code === "23505") {
      const { data: existing } = await this.db.from("tasks").select("id").eq("company_id", companyId).eq("source_email_id", t.emailId).maybeSingle();
      if (existing) return { taskId: existing.id as string, created: false };
    }
    throw new Error("No se pudo crear la tarea del agente.");
  }

  async listLive(companyId: string, limit: number): Promise<LiveMessage[]> {
    const { data, error } = await this.db
      .from("emails")
      .select("id, thread_id, body, occurred_at, ingested_at")
      .eq("company_id", companyId)
      .eq("direction", "inbound")
      .not("ingested_at", "is", null)
      .order("ingested_at", { ascending: false })
      .limit(limit);
    if (error) throw new Error("No se pudieron leer los correos recibidos.");
    const out: LiveMessage[] = [];
    const refs = new Map<string, ThreadRef | null>();
    for (const r of data ?? []) {
      const tid = r.thread_id as string;
      if (!refs.has(tid)) refs.set(tid, await this.threadRef(companyId, tid));
      const t = refs.get(tid);
      if (!t) continue;
      out.push({
        emailId: r.id as string, threadId: tid, threadSubject: t.subject, receivedAt: r.occurred_at as string,
        contactName: t.contactName, contactEmail: t.contactEmail, agentSlug: t.agentSlug, text: (r.body as string).slice(0, 2000),
      });
    }
    return out;
  }
}
