import { Resend } from "resend";

export type OutgoingEmail = {
  /** «Nombre <dirección>» */
  from: string;
  to: string;
  replyTo: string;
  subject: string;
  text: string;
  /** Message-ID, In-Reply-To y References, para encadenar el hilo. */
  headers: Record<string, string>;
  /** Evita enviar dos veces el mismo correo si se repite la petición. */
  idempotencyKey: string;
};

/** Interfaz del proveedor de envío: los tests usan uno falso; en producción, Resend. */
export interface EmailSender {
  send(email: OutgoingEmail): Promise<{ id: string }>;
}

export class ResendSender implements EmailSender {
  private readonly client: Resend;

  constructor(apiKey: string) {
    this.client = new Resend(apiKey);
  }

  async send(e: OutgoingEmail): Promise<{ id: string }> {
    const { data, error } = await this.client.emails.send(
      { from: e.from, to: [e.to], replyTo: e.replyTo, subject: e.subject, text: e.text, headers: e.headers },
      { idempotencyKey: e.idempotencyKey },
    );
    // El mensaje de error de Resend no incluye la clave; aun así no se propaga el objeto entero.
    if (error || !data) throw new Error(`Resend rechazó el envío${error?.message ? `: ${error.message}` : ""}`);
    return { id: data.id };
  }
}
