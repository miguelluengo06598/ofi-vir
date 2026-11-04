import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { ChainHeaders, ClaimResult, DeliveryStatus, DeliveryTarget, EmailStore, OutboundEmail } from "./store.ts";

const likeExact = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);
const EMAIL_COLS = "id, company_id, thread_id, subject, body, to_address, delivery_status, attachments, approval_id, resend_message_id";

/**
 * Almacén de correo sobre Supabase con la clave `service_role` (solo servidor). Esa clave se salta la RLS,
 * así que CADA consulta filtra por `company_id` a mano (salvo `findByResendId`, que parte del id único de Resend).
 */
export class SupabaseEmailStore implements EmailStore {
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
}
