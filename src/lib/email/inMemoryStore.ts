import type { InboundEmailData, InboundStore, ThreadRef } from "./inboundStore.ts";
import { contentHash } from "./service.ts";
import type { ChainHeaders, ClaimResult, DeliveryStatus, DeliveryTarget, EmailStore, OutboundEmail } from "./store.ts";

type Approval = { id: string; companyId: string; status: "pending" | "approved" | "rejected"; kind: string; contentSha256: string | null };
type Row = {
  id: string; companyId: string; threadId: string; subject: string; body: string; toAddress: string; fromAddress: string;
  deliveryStatus: string; hasAttachments: boolean; approvalId: string | null; resendId: string | null;
  messageId: string | null; inReplyTo: string | null; references: string[]; at: number;
  direction?: "inbound"; ingested?: boolean;
};
type Thread = { id: string; companyId: string; agentId: string; contactId: string; status: string; note: string | null; subject?: string };

/** Almacén en memoria para tests. Repite las reglas del disparador de la base (aprobación, texto y límite diario). */
export class InMemoryEmailStore implements EmailStore, InboundStore {
  agents: { id: string; companyId: string; slug: string; name: string; dailyLimit: number; model?: string }[] = [];
  tasks: { id: string; companyId: string; agentId: string; emailId: string; title: string; model: string }[] = [];
  contacts: { id: string; companyId: string; name: string; email: string }[] = [];
  threads: Thread[] = [];
  emails: Row[] = [];
  approvals: Approval[] = [];
  private seq = 0;
  private clock = 1;

  seed(companyId: string, opts: { limit?: number; to?: string; attachments?: boolean; approved?: boolean; subject?: string; body?: string } = {}) {
    const n = ++this.seq;
    const agent = { id: `agent${n}`, companyId, slug: `irene-soler-${n}`, name: "Irene Soler", dailyLimit: opts.limit ?? 50 };
    const contact = { id: `contact${n}`, companyId, name: "Laura Gómez", email: opts.to ?? "delivered@resend.dev" };
    const thread: Thread = { id: `thread${n}`, companyId, agentId: agent.id, contactId: contact.id, status: "pending_approval", note: null };
    const approval: Approval = { id: `ap${n}`, companyId, status: "pending", kind: "email", contentSha256: null };
    const email: Row = {
      id: `email${n}`, companyId, threadId: thread.id, subject: opts.subject ?? "Propuesta", body: opts.body ?? "Hola, Laura.", toAddress: contact.email,
      fromAddress: "", deliveryStatus: "pending_approval", hasAttachments: opts.attachments ?? false, approvalId: approval.id, resendId: null,
      messageId: null, inReplyTo: null, references: [], at: this.clock++,
    };
    this.agents.push(agent); this.contacts.push(contact); this.threads.push(thread); this.approvals.push(approval); this.emails.push(email);
    if (opts.approved) this.approve(approval.id);
    return { agent, contact, thread, approval, email };
  }

  /** Aprueba tal como lo hace la base: la huella sale del texto del borrador. */
  approve(approvalId: string) {
    const ap = this.approvals.find((a) => a.id === approvalId)!;
    const e = this.emails.find((x) => x.approvalId === approvalId)!;
    ap.status = "approved";
    ap.contentSha256 = contentHash(e.subject, e.body);
  }
  /** Añade un correo ya enviado al hilo (para el límite diario y el encadenado). */
  addSent(threadId: string, messageId: string, references: string[] = []) {
    const t = this.threads.find((x) => x.id === threadId)!;
    this.emails.push({
      id: `sent${++this.seq}`, companyId: t.companyId, threadId, subject: "x", body: "x", toAddress: "x", fromAddress: "x", deliveryStatus: "delivered",
      hasAttachments: false, approvalId: null, resendId: `re_${this.seq}`, messageId, inReplyTo: null, references, at: this.clock++,
    });
  }

  private view(r: Row): OutboundEmail | null {
    const t = this.threads.find((x) => x.id === r.threadId && x.companyId === r.companyId);
    const agent = t && this.agents.find((a) => a.id === t.agentId);
    if (!t || !agent) return null;
    const ap = this.approvals.find((a) => a.id === r.approvalId && a.companyId === r.companyId);
    return {
      id: r.id, companyId: r.companyId, threadId: r.threadId, subject: r.subject, body: r.body, toAddress: r.toAddress, deliveryStatus: r.deliveryStatus,
      hasAttachments: r.hasAttachments, agent: { id: agent.id, slug: agent.slug, name: agent.name, dailyLimit: agent.dailyLimit }, contactId: t.contactId,
      approval: ap ? { id: ap.id, status: ap.status, kind: ap.kind, contentSha256: ap.contentSha256 } : null,
    };
  }

  async getEmail(companyId: string, emailId: string) {
    const r = this.emails.find((e) => e.companyId === companyId && e.id === emailId);
    return r ? this.view(r) : null;
  }
  async findDraft(companyId: string, agentSlug: string, toAddress: string) {
    for (const r of this.emails.filter((e) => e.companyId === companyId && e.deliveryStatus === "pending_approval" && e.toAddress.toLowerCase() === toAddress.toLowerCase())) {
      const v = this.view(r);
      if (v?.agent.slug === agentSlug) return v;
    }
    return null;
  }
  async sentToday(companyId: string, agentId: string) {
    return this.countSent(companyId, agentId);
  }
  private countSent(companyId: string, agentId: string) {
    const threads = this.threads.filter((t) => t.companyId === companyId && t.agentId === agentId).map((t) => t.id);
    return this.emails.filter((e) => e.companyId === companyId && e.direction !== "inbound" && threads.includes(e.threadId) && e.deliveryStatus !== "pending_approval").length;
  }
  async chainHeaders(companyId: string, threadId: string): Promise<ChainHeaders> {
    const last = this.emails.filter((e) => e.companyId === companyId && e.threadId === threadId && e.messageId).sort((a, b) => b.at - a.at)[0];
    return last ? { inReplyTo: last.messageId, references: last.references } : { inReplyTo: null, references: [] };
  }

  async approveDraft(companyId: string, approvalId: string, _userId: string, text: { subject: string; body: string }) {
    const ap = this.approvals.find((a) => a.id === approvalId && a.companyId === companyId);
    if (!ap || ap.status !== "pending") throw new Error("La aprobación no existe o ya está resuelta");
    const e = this.emails.find((x) => x.approvalId === approvalId && x.companyId === companyId)!;
    e.subject = text.subject;
    e.body = text.body;
    this.approve(approvalId);
  }

  // Sin `await` entre comprobar y reservar: igual de atómico que el UPDATE condicional de la base.
  async claimForSend(companyId: string, emailId: string, d: { fromAddress: string; messageId: string; inReplyTo: string | null; references: string[] }): Promise<ClaimResult> {
    const e = this.emails.find((x) => x.companyId === companyId && x.id === emailId);
    if (!e || e.deliveryStatus !== "pending_approval") return { ok: false, reason: "ya_reclamado", message: "Este correo ya se está enviando o se envió." };
    const ap = this.approvals.find((a) => a.id === e.approvalId && a.companyId === companyId);
    if (!ap || ap.status !== "approved") return { ok: false, reason: "rechazado", message: "Correo saliente sin aprobación registrada" };
    if (ap.contentSha256 !== contentHash(e.subject, e.body)) return { ok: false, reason: "rechazado", message: "El texto del correo no coincide con el aprobado" };
    const t = this.threads.find((x) => x.id === e.threadId)!;
    const agent = this.agents.find((a) => a.id === t.agentId)!;
    if (this.countSent(companyId, agent.id) >= agent.dailyLimit) return { ok: false, reason: "rechazado", message: "El agente ha alcanzado su límite diario de correos" };
    Object.assign(e, { deliveryStatus: "sent", fromAddress: d.fromAddress, messageId: d.messageId, inReplyTo: d.inReplyTo, references: d.references, at: this.clock++ });
    return { ok: true };
  }
  async releaseClaim(companyId: string, emailId: string) {
    const e = this.emails.find((x) => x.companyId === companyId && x.id === emailId);
    if (e && e.deliveryStatus === "sent" && !e.resendId) Object.assign(e, { deliveryStatus: "pending_approval", messageId: null, inReplyTo: null, references: [] });
  }
  async recordSent(companyId: string, emailId: string, threadId: string, resendId: string) {
    this.emails.find((x) => x.companyId === companyId && x.id === emailId)!.resendId = resendId;
    const t = this.threads.find((x) => x.companyId === companyId && x.id === threadId)!;
    t.status = "sent";
  }

  // --- Recepción ---------------------------------------------------------------------------------------------

  private ref(r: { threadId: string; companyId: string }): ThreadRef | null {
    const t = this.threads.find((x) => x.id === r.threadId && x.companyId === r.companyId);
    const c = t && this.contacts.find((x) => x.id === t.contactId);
    const a = t && this.agents.find((x) => x.id === t.agentId);
    if (!t || !c || !a) return null;
    return {
      companyId: t.companyId, threadId: t.id, subject: t.subject ?? "Propuesta", contactId: c.id, contactName: c.name, contactEmail: c.email,
      agentId: a.id, agentSlug: a.slug, agentName: a.name, agentModel: a.model ?? "claude-haiku-5-5",
    };
  }
  async findInboundByResendId(resendId: string) {
    const e = this.emails.find((x) => x.direction === "inbound" && x.resendId === resendId);
    const thread = e && this.ref(e);
    return e && thread ? { emailId: e.id, thread } : null;
  }
  async findThreadByMessageIds(ids: string[]) {
    for (const id of ids) {
      const e = this.emails.find((x) => x.messageId === id);
      if (e) return this.ref(e);
    }
    return null;
  }
  async findLatestThreadForAddress(companyId: string, address: string) {
    const c = this.contacts.find((x) => x.companyId === companyId && x.email === address.toLowerCase());
    const t = c && [...this.threads].reverse().find((x) => x.companyId === companyId && x.contactId === c.id);
    return t ? this.ref({ threadId: t.id, companyId }) : null;
  }
  async findContactByEmail(companyId: string, email: string) {
    return this.contacts.find((x) => x.companyId === companyId && x.email === email.toLowerCase()) ?? null;
  }
  async createContact(companyId: string, c: { name: string; email: string }) {
    const contact = { id: `contact${++this.seq}`, companyId, name: c.name, email: c.email.toLowerCase() };
    this.contacts.push(contact);
    return contact;
  }
  async findAgentBySlug(companyId: string, slug: string) {
    const a = this.agents.find((x) => x.companyId === companyId && x.slug === slug);
    return a ? { id: a.id, slug: a.slug, name: a.name, model: a.model ?? "claude-haiku-5-5" } : null;
  }
  async createThread(companyId: string, t: { contactId: string; agentId: string; subject: string }) {
    const thread: Thread = { id: `thread${++this.seq}`, companyId, agentId: t.agentId, contactId: t.contactId, status: "replied", note: null, subject: t.subject };
    this.threads.push(thread);
    return thread.id;
  }
  async insertInbound(companyId: string, threadId: string, e: InboundEmailData) {
    const dup = this.emails.find((x) => x.direction === "inbound" && x.resendId === e.resendId);
    if (dup) return dup.id;
    const row: Row = {
      id: `in${++this.seq}`, companyId, threadId, subject: e.subject, body: e.body, toAddress: e.toAddress, fromAddress: e.fromAddress,
      deliveryStatus: "received", hasAttachments: false, approvalId: null, resendId: e.resendId, messageId: e.messageId, inReplyTo: e.inReplyTo,
      references: e.references, at: this.clock++, direction: "inbound", ingested: true,
    };
    this.emails.push(row);
    return row.id;
  }
  async markThreadReplied(companyId: string, threadId: string) {
    const t = this.threads.find((x) => x.companyId === companyId && x.id === threadId)!;
    Object.assign(t, { status: "replied", note: null });
  }
  async ensureTask(companyId: string, t: { agentId: string; emailId: string; title: string; model: string }) {
    const existing = this.tasks.find((x) => x.companyId === companyId && x.emailId === t.emailId);
    if (existing) return { taskId: existing.id, created: false };
    const task = { id: `task${++this.seq}`, companyId, ...t };
    this.tasks.push(task);
    return { taskId: task.id, created: true };
  }

  async findByResendId(resendId: string): Promise<DeliveryTarget | null> {
    const e = this.emails.find((x) => x.resendId === resendId && x.direction !== "inbound");
    const t = e && this.threads.find((x) => x.id === e.threadId);
    const c = t && this.contacts.find((x) => x.id === t.contactId);
    if (!e || !t || !c) return null;
    return {
      companyId: e.companyId, emailId: e.id, threadId: t.id, contactId: c.id, contactName: c.name, contactEmail: c.email,
      agentId: t.agentId, toAddress: e.toAddress, deliveryStatus: e.deliveryStatus, threadStatus: t.status,
    };
  }
  async updateDelivery(target: DeliveryTarget, status: DeliveryStatus, note: string | null) {
    this.emails.find((x) => x.id === target.emailId)!.deliveryStatus = status;
    const t = this.threads.find((x) => x.id === target.threadId)!;
    if (t.status !== "replied") Object.assign(t, { status, note });
  }
}
