import { Resend } from "resend";

export type ReceivedEmail = {
  id: string;
  from: string;
  to: string[];
  subject: string;
  text: string | null;
  html: string | null;
  headers: Record<string, string>;
  messageId: string | null;
  createdAt: string;
  attachments: { filename: string; size: number }[];
};

/** Recupera un correo recibido completo (el webhook solo trae un resumen). Los tests usan uno falso. */
export interface InboundFetcher {
  get(emailId: string): Promise<ReceivedEmail>;
}

export class ResendInboundFetcher implements InboundFetcher {
  private readonly client: Resend;

  constructor(apiKey: string) {
    this.client = new Resend(apiKey);
  }

  async get(emailId: string): Promise<ReceivedEmail> {
    const { data, error } = await this.client.emails.receiving.get(emailId);
    if (error || !data) throw new Error(`No se pudo recuperar el correo recibido de Resend${error?.message ? `: ${error.message}` : ""}`);
    return {
      id: data.id,
      from: data.from,
      to: data.to,
      subject: data.subject,
      text: data.text,
      html: data.html,
      headers: data.headers ?? {},
      messageId: data.message_id ?? null,
      createdAt: data.created_at,
      attachments: data.attachments.map((a) => ({ filename: a.filename ?? "sin nombre", size: a.size })),
    };
  }
}
