/** Acceso a datos del correo. Toda operación va en el contexto de una empresa (`companyId`). */

export type OutboundEmail = {
  id: string;
  companyId: string;
  threadId: string;
  subject: string;
  body: string;
  toAddress: string;
  deliveryStatus: string;
  hasAttachments: boolean;
  agent: { id: string; slug: string; name: string; dailyLimit: number };
  contactId: string;
  approval: { id: string; status: "pending" | "approved" | "rejected"; kind: string; contentSha256: string | null } | null;
};

export type ChainHeaders = { inReplyTo: string | null; references: string[] };

export type ClaimResult = { ok: true } | { ok: false; reason: "ya_reclamado" | "rechazado"; message: string };

export type DeliveryTarget = {
  companyId: string;
  emailId: string;
  threadId: string;
  contactId: string;
  contactName: string;
  contactEmail: string;
  agentId: string;
  toAddress: string;
  deliveryStatus: string;
  threadStatus: string;
};

export type DeliveryStatus = "sent" | "delivered" | "bounced" | "complained";

export interface EmailStore {
  getEmail(companyId: string, emailId: string): Promise<OutboundEmail | null>;
  /** Borrador saliente pendiente de un agente (por su slug) para una dirección. */
  findDraft(companyId: string, agentSlug: string, toAddress: string): Promise<OutboundEmail | null>;
  sentToday(companyId: string, agentId: string): Promise<number>;
  /** Cabeceras del último correo del hilo, para responder en cadena. */
  chainHeaders(companyId: string, threadId: string): Promise<ChainHeaders>;

  /** Aprueba el borrador con el texto exacto indicado (atómico). Lanza si la aprobación no está pendiente. */
  approveDraft(companyId: string, approvalId: string, userId: string, text: { subject: string; body: string }): Promise<void>;

  /**
   * Reserva el envío pasando el correo de «pendiente» a «enviado». La base comprueba aprobación, texto y límite diario
   * (disparador), y solo una petición puede reservarlo: así no se envía dos veces.
   */
  claimForSend(
    companyId: string,
    emailId: string,
    data: { fromAddress: string; messageId: string; inReplyTo: string | null; references: string[] },
  ): Promise<ClaimResult>;
  /** Devuelve a «pendiente» un correo reservado cuyo envío falló. */
  releaseClaim(companyId: string, emailId: string): Promise<void>;
  recordSent(companyId: string, emailId: string, threadId: string, resendId: string): Promise<void>;

  findByResendId(resendId: string): Promise<DeliveryTarget | null>;
  updateDelivery(target: DeliveryTarget, status: DeliveryStatus, note: string | null): Promise<void>;
}
