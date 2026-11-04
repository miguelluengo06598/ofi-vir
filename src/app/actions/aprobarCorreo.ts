"use server";

import { emailConfigFromEnv } from "@/lib/email/config";
import { ResendSender } from "@/lib/email/sender";
import { aprobarYEnviar, type AprobarYEnviarResult } from "@/lib/email/service";
import { SupabaseEmailStore } from "@/lib/email/supabaseStore";

export type AprobarCorreoResult = AprobarYEnviarResult | { estado: "sin_backend" };

/**
 * Aprueba un borrador de correo y lo envía de verdad. Se ejecuta en el servidor: las claves nunca llegan al navegador.
 * Sin backend configurado devuelve `sin_backend` y la interfaz sigue en modo simulado.
 * Mientras no haya inicio de sesión, empresa y persona salen de DEV_COMPANY_ID y DEV_USER_ID.
 */
export async function aprobarCorreo(input: { agentSlug: string; toEmail: string; subject: string; body: string }): Promise<AprobarCorreoResult> {
  const companyId = process.env.DEV_COMPANY_ID?.trim();
  const userId = process.env.DEV_USER_ID?.trim();
  const store = SupabaseEmailStore.fromEnv();
  if (!companyId || !userId || !store) return { estado: "sin_backend" };

  const config = emailConfigFromEnv();
  const sender = config.apiKey ? new ResendSender(config.apiKey) : null;
  try {
    return await aprobarYEnviar({ store, sender, config }, companyId, userId, input);
  } catch (e) {
    // Entrada inválida o fallo inesperado: el detalle va a la consola del servidor; el navegador recibe un mensaje genérico.
    console.error("aprobarCorreo:", e instanceof Error ? e.message : "error desconocido");
    return { estado: "no_enviado", codigo: "envio_fallido", mensaje: "No se pudo enviar el correo. Revisa la consola del servidor." };
  }
}
