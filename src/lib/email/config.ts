/** Configuración del correo y política de destinatarios. Solo servidor. */

export type EmailConfig = {
  apiKey: string | null;
  /** Remitente (dominio verificado en Resend). */
  from: string | null;
  /** Dirección de recepción: a ella llegan las respuestas. */
  replyTo: string | null;
  /** Fuera de producción solo se envía a las direcciones de prueba de Resend y a esta lista. */
  devAllowlist: string[];
  production: boolean;
};

export function emailConfigFromEnv(env: Record<string, string | undefined> = process.env): EmailConfig {
  const clean = (v: string | undefined) => v?.trim() || null;
  return {
    apiKey: clean(env.RESEND_API_KEY),
    from: clean(env.RESEND_FROM_EMAIL),
    replyTo: clean(env.RESEND_REPLY_TO),
    devAllowlist: (env.EMAIL_DEV_ALLOWLIST ?? "").split(",").map((a) => a.trim().toLowerCase()).filter(Boolean),
    production: env.NODE_ENV === "production",
  };
}

/** Direcciones de prueba de Resend (admiten etiqueta: delivered+ana@resend.dev). */
const RESEND_TEST = /^(delivered|bounced|complained|suppressed)(\+[^@\s]+)?@resend\.dev$/;

export const normalizeAddress = (a: string) => a.trim().toLowerCase();

export type RecipientCheck = { allowed: true } | { allowed: false; reason: string };

/** En producción se envía a cualquiera; en desarrollo, solo a direcciones de prueba o de la lista blanca. */
export function checkRecipient(to: string, config: Pick<EmailConfig, "production" | "devAllowlist">): RecipientCheck {
  if (config.production) return { allowed: true };
  const address = normalizeAddress(to);
  if (RESEND_TEST.test(address) || config.devAllowlist.includes(address)) return { allowed: true };
  return {
    allowed: false,
    reason: `En desarrollo solo se envía a direcciones de prueba de Resend (delivered@resend.dev, bounced@resend.dev…) o a las de EMAIL_DEV_ALLOWLIST. Bloqueado: ${address}.`,
  };
}

/** Dominio de una dirección, con o sin nombre: «Ana <ana@dominio.com>» → dominio.com. */
export function domainOf(address: string): string | null {
  const m = address.match(/@([^>\s]+)>?\s*$/);
  return m ? m[1].toLowerCase() : null;
}
