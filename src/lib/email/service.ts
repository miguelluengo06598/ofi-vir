import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { checkRecipient, domainOf, type EmailConfig } from "./config.ts";
import type { EmailSender } from "./sender.ts";
import type { DeliveryStatus, EmailStore, OutboundEmail } from "./store.ts";

export type EmailErrorCode =
  | "no_encontrado"
  | "ya_enviado"
  | "sin_aprobacion"
  | "texto_cambiado"
  | "destinatario_bloqueado"
  | "configuracion"
  | "adjuntos"
  | "limite_diario"
  | "rechazado"
  | "envio_fallido";

/** Error esperado del envío: el mensaje está en español y es seguro mostrarlo (nunca lleva claves). */
export class EmailError extends Error {
  readonly code: EmailErrorCode;
  constructor(code: EmailErrorCode, message: string) {
    super(message);
    this.name = "EmailError";
    this.code = code;
  }
}

export type EmailDeps = { store: EmailStore; sender: EmailSender | null; config: EmailConfig };

/** Misma huella que `public.email_content_hash` en la base: SHA-256 de «asunto\ncuerpo». */
export const contentHash = (subject: string, body: string) => createHash("sha256").update(`${subject}\n${body}`, "utf8").digest("hex");

const addressOnly = (from: string) => from.match(/<([^>]+)>/)?.[1] ?? from.trim();
const displayFrom = (name: string, from: string) => `${name.replace(/[<>"\r\n]/g, "").trim()} <${addressOnly(from)}>`;

/** Comprobaciones previas que no dependen de la aprobación (se hacen también antes de aprobar). */
export async function validarEnvio(deps: EmailDeps, email: OutboundEmail): Promise<{ from: string; replyTo: string }> {
  if (email.deliveryStatus !== "pending_approval") throw new EmailError("ya_enviado", "Este correo ya se envió o no está pendiente.");
  if (email.hasAttachments) {
    throw new EmailError("adjuntos", "El borrador tiene adjuntos y todavía no se pueden enviar archivos adjuntos. Quítalos o espera a esa función.");
  }
  const recipient = checkRecipient(email.toAddress, deps.config);
  if (!recipient.allowed) throw new EmailError("destinatario_bloqueado", recipient.reason);
  const { from, replyTo } = deps.config;
  if (!from) throw new EmailError("configuracion", "Falta RESEND_FROM_EMAIL en .env.local.");
  if (!replyTo) throw new EmailError("configuracion", "Falta RESEND_REPLY_TO: la dirección de recepción a la que llegarán las respuestas.");
  if (!deps.sender) throw new EmailError("configuracion", "Falta RESEND_API_KEY en .env.local.");
  const sent = await deps.store.sentToday(email.companyId, email.agent.id);
  if (sent >= email.agent.dailyLimit) {
    throw new EmailError("limite_diario", `${email.agent.name} ha llegado a su límite diario de ${email.agent.dailyLimit} correos.`);
  }
  return { from, replyTo };
}

/**
 * Envía un correo ya aprobado. Solo sale si existe una aprobación APROBADA para ese correo, con el texto exacto
 * que se aprobó, dentro del límite diario del agente y para un destinatario permitido. Las respuestas llegan a la
 * dirección de recepción (`RESEND_REPLY_TO`) y el correo queda encadenado al hilo con sus cabeceras.
 * La base de datos repite las comprobaciones de aprobación, texto y límite (disparador), aunque este código falle.
 */
export async function enviarCorreo(deps: EmailDeps, companyId: string, emailId: string): Promise<{ resendId: string; messageId: string }> {
  const email = await deps.store.getEmail(companyId, emailId);
  if (!email) throw new EmailError("no_encontrado", "No existe ese correo en tu empresa.");

  const ap = email.approval;
  if (!ap || ap.kind !== "email" || ap.status !== "approved") {
    throw new EmailError("sin_aprobacion", "Este correo no tiene una aprobación aprobada: no se puede enviar.");
  }
  if (ap.contentSha256 !== contentHash(email.subject, email.body)) {
    throw new EmailError("texto_cambiado", "El texto cambió después de aprobarse: hay que aprobarlo de nuevo.");
  }
  const { from, replyTo } = await validarEnvio(deps, email);

  const chain = await deps.store.chainHeaders(companyId, email.threadId);
  const domain = domainOf(from) ?? "localhost";
  const messageId = `<${randomUUID()}@${domain}>`;
  const references = chain.inReplyTo ? [...chain.references.filter((r) => r !== chain.inReplyTo), chain.inReplyTo] : [];

  const claim = await deps.store.claimForSend(companyId, emailId, {
    fromAddress: addressOnly(from), messageId, inReplyTo: chain.inReplyTo, references,
  });
  if (!claim.ok) {
    throw new EmailError(claim.reason === "ya_reclamado" ? "ya_enviado" : "rechazado", claim.message);
  }

  let resendId: string;
  try {
    ({ id: resendId } = await deps.sender!.send({
      from: displayFrom(email.agent.name, from),
      to: email.toAddress,
      replyTo,
      subject: email.subject,
      text: email.body,
      headers: {
        "Message-ID": messageId,
        ...(chain.inReplyTo ? { "In-Reply-To": chain.inReplyTo, References: references.join(" ") } : {}),
      },
      idempotencyKey: `correo-${emailId}`,
    }));
  } catch (e) {
    await deps.store.releaseClaim(companyId, emailId);
    throw new EmailError("envio_fallido", e instanceof Error ? e.message : "No se pudo enviar el correo.");
  }

  try {
    await deps.store.recordSent(companyId, emailId, email.threadId, resendId);
  } catch {
    // El correo ya salió: no se revierte. Se avisa para poder conciliarlo a mano.
    throw new EmailError("envio_fallido", `El correo se envió (id de Resend ${resendId}) pero no se pudo registrar. No lo reenvíes.`);
  }
  return { resendId, messageId };
}

const approveSchema = z.object({
  agentSlug: z.string().min(1).max(100),
  toEmail: z.string().trim().toLowerCase().email().max(320),
  subject: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(20000),
});
export type AprobarYEnviarInput = z.input<typeof approveSchema>;

export type AprobarYEnviarResult =
  | { estado: "enviado"; resendId: string }
  | { estado: "no_enviado"; codigo: EmailErrorCode | "sin_borrador"; mensaje: string };

/**
 * Botón «Aprobar» de un borrador de correo: registra la aprobación (quién, cuándo y el texto exacto, con su huella)
 * y envía de verdad. Antes de aprobar comprueba destinatario, límite y configuración: si el envío no puede salir,
 * no se aprueba nada y el borrador sigue pendiente.
 */
export async function aprobarYEnviar(deps: EmailDeps, companyId: string, userId: string, input: AprobarYEnviarInput): Promise<AprobarYEnviarResult> {
  const data = approveSchema.parse(input);
  const fail = (e: unknown): AprobarYEnviarResult => {
    if (e instanceof EmailError) return { estado: "no_enviado", codigo: e.code, mensaje: e.message };
    throw e;
  };
  try {
    const draft = await deps.store.findDraft(companyId, data.agentSlug, data.toEmail);
    if (!draft || !draft.approval) {
      return { estado: "no_enviado", codigo: "sin_borrador", mensaje: "No hay en la base un borrador pendiente de este agente para ese destinatario." };
    }
    await validarEnvio(deps, draft);

    if (draft.approval.status === "pending") {
      await deps.store.approveDraft(companyId, draft.approval.id, userId, { subject: data.subject, body: data.body });
    } else if (draft.approval.status === "approved") {
      // Ya aprobado en un intento anterior cuyo envío falló: solo se reintenta si el texto es el aprobado.
      if (draft.approval.contentSha256 !== contentHash(data.subject, data.body)) {
        throw new EmailError("texto_cambiado", "El texto cambió después de aprobarse: hay que aprobarlo de nuevo.");
      }
    } else {
      throw new EmailError("rechazado", "Esta petición fue rechazada.");
    }
    const { resendId } = await enviarCorreo(deps, companyId, draft.id);
    return { estado: "enviado", resendId };
  } catch (e) {
    return fail(e);
  }
}

// --- Avisos de entrega (webhook) -------------------------------------------------------------------------------

const eventSchema = z.object({
  type: z.string(),
  data: z.object({
    email_id: z.string().min(1),
    bounce: z.object({ message: z.string().optional(), type: z.string().optional(), subType: z.string().optional() }).partial().optional(),
  }).loose(),
});
export type DeliveryEvent = z.input<typeof eventSchema>;

const STATUS_BY_EVENT: Record<string, DeliveryStatus> = {
  "email.sent": "sent",
  "email.delivered": "delivered",
  "email.bounced": "bounced",
  "email.complained": "complained",
};
/** Un aviso solo puede subir de nivel: llegar tarde o repetido no deshace un rebote. */
const RANK: Record<string, number> = { pending_approval: 0, sent: 1, delivered: 2, bounced: 3, complained: 4 };

export type Rebote = { companyId: string; agentId: string; contactId: string; contactName: string; contactEmail: string; address: string; motivo: string };
export type DeliveryOutcome = { estado: "actualizado" | "sin_cambios" | "ignorado" | "desconocido"; rebote?: Rebote };

/** Aplica un aviso de entrega de Resend al correo. No guarda en memoria: eso lo hace quien llama con el `rebote`. */
export async function registrarEntrega(store: EmailStore, raw: DeliveryEvent): Promise<DeliveryOutcome> {
  const event = eventSchema.parse(raw);
  const status = STATUS_BY_EVENT[event.type];
  if (!status) return { estado: "ignorado" };
  const target = await store.findByResendId(event.data.email_id);
  if (!target) return { estado: "desconocido" };
  const motivo = (event.data.bounce?.message ?? "").replace(/\s+/g, " ").trim().slice(0, 200);
  const rebote: Rebote = { companyId: target.companyId, agentId: target.agentId, contactId: target.contactId, contactName: target.contactName, contactEmail: target.contactEmail, address: target.toAddress, motivo };
  if ((RANK[status] ?? 0) <= (RANK[target.deliveryStatus] ?? 0)) {
    // Si Resend reintenta un rebote ya anotado, se devuelve igual para completar lo que falló la primera vez (no duplica).
    return status === "bounced" && target.deliveryStatus === "bounced" ? { estado: "sin_cambios", rebote } : { estado: "sin_cambios" };
  }

  const note = status === "bounced" ? `Rebotó${motivo ? `: ${motivo}` : ""}` : status === "complained" ? "El destinatario lo marcó como spam" : null;
  await store.updateDelivery(target, status, note);
  return status === "bounced" ? { estado: "actualizado", rebote } : { estado: "actualizado" };
}
