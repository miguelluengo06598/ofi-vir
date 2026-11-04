/** Acceso a datos de la recepción de correo. Toda operación va en el contexto de una empresa (salvo la búsqueda por cabeceras). */

export type ThreadRef = {
  companyId: string;
  threadId: string;
  subject: string;
  contactId: string;
  contactName: string;
  contactEmail: string;
  agentId: string;
  agentSlug: string;
  agentName: string;
  agentModel: string;
};

export type InboundEmailData = {
  fromAddress: string;
  toAddress: string;
  subject: string;
  body: string;
  messageId: string | null;
  inReplyTo: string | null;
  references: string[];
  resendId: string;
  occurredAt: string;
  attachments: { filename: string; size: number }[];
};

export interface InboundStore {
  /** Correo recibido ya guardado con ese id de Resend (para no duplicarlo si el webhook se repite). */
  findInboundByResendId(resendId: string): Promise<{ emailId: string; thread: ThreadRef } | null>;
  /** Hilo cuyo correo tiene alguno de estos Message-ID (de los más recientes a los más antiguos). */
  findThreadByMessageIds(messageIds: string[]): Promise<ThreadRef | null>;
  /** Último hilo con el contacto que tiene esa dirección. */
  findLatestThreadForAddress(companyId: string, address: string): Promise<ThreadRef | null>;
  /** Contacto de la empresa con esa dirección, o null. */
  findContactByEmail(companyId: string, email: string): Promise<{ id: string; name: string; email: string } | null>;
  createContact(companyId: string, c: { name: string; email: string }): Promise<{ id: string; name: string; email: string }>;
  findAgentBySlug(companyId: string, slug: string): Promise<{ id: string; slug: string; name: string; model: string } | null>;
  createThread(companyId: string, t: { contactId: string; agentId: string; subject: string }): Promise<string>;
  insertInbound(companyId: string, threadId: string, e: InboundEmailData): Promise<string>;
  /** El hilo pasa a «Respondido» y se actualiza su última actividad. */
  markThreadReplied(companyId: string, threadId: string, at: string): Promise<void>;
  /** Una tarea por correo recibido (si ya existe, devuelve la misma). */
  ensureTask(companyId: string, t: { agentId: string; emailId: string; title: string; model: string }): Promise<{ taskId: string; created: boolean }>;
}

export type LiveMessage = {
  emailId: string;
  threadId: string;
  threadSubject: string;
  receivedAt: string;
  contactName: string;
  contactEmail: string;
  agentSlug: string;
  /** Texto plano, ya recortado. Es contenido externo: la interfaz lo muestra como texto, nunca como HTML. */
  text: string;
};

export interface InboxReader {
  /** Últimos correos recibidos por el webhook, del más reciente al más antiguo. */
  listLive(companyId: string, limit: number): Promise<LiveMessage[]>;
}
