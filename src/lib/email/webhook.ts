import { Webhook } from "svix";
import { registrarEntrega, type Rebote } from "./service.ts";
import type { EmailStore } from "./store.ts";

export type WebhookResponse = { status: number; body: { estado: string } };

/**
 * Procesa un webhook de Resend: primero verifica la firma (Svix) sobre el cuerpo SIN tocar, y solo entonces lo lee.
 * Una firma ausente, caducada o falsa se rechaza con 400 sin procesar nada. Si algo falla al guardar, devuelve 500
 * para que Resend reintente (el proceso es idempotente: un aviso repetido no duplica nada).
 */
export async function procesarWebhookResend(args: {
  secret: string | null;
  rawBody: string;
  headers: { get(name: string): string | null };
  store: EmailStore;
  /** Qué hacer cuando un correo rebota (p. ej. anotarlo en la memoria del contacto). */
  alRebotar: (rebote: Rebote) => Promise<void>;
}): Promise<WebhookResponse> {
  if (!args.secret) return { status: 503, body: { estado: "webhook_sin_configurar" } };

  const signed = {
    "svix-id": args.headers.get("svix-id") ?? "",
    "svix-timestamp": args.headers.get("svix-timestamp") ?? "",
    "svix-signature": args.headers.get("svix-signature") ?? "",
  };
  try {
    new Webhook(args.secret).verify(args.rawBody, signed);
  } catch {
    return { status: 400, body: { estado: "firma_no_valida" } };
  }
  // Solo se lee el cuerpo cuando la firma ya es válida.
  let payload: unknown;
  try {
    payload = JSON.parse(args.rawBody);
  } catch {
    return { status: 400, body: { estado: "evento_no_valido" } };
  }

  try {
    const outcome = await registrarEntrega(args.store, payload as Parameters<typeof registrarEntrega>[1]);
    if (outcome.rebote) await args.alRebotar(outcome.rebote);
    return { status: 200, body: { estado: outcome.estado } };
  } catch (e) {
    // Un cuerpo firmado pero mal formado no mejora al reintentar: 400. Cualquier otro fallo, 500 para que reintente.
    if (e instanceof Error && e.name === "ZodError") return { status: 400, body: { estado: "evento_no_valido" } };
    return { status: 500, body: { estado: "error_interno" } };
  }
}
