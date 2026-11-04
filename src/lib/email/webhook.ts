import { Webhook } from "svix";
import { procesarCorreoRecibido, type InboundDeps } from "./inbound.ts";
import { registrarEntrega, type Rebote } from "./service.ts";
import type { EmailStore } from "./store.ts";

export type WebhookResponse = { status: number; body: { estado: string } };

type HeaderBag = { get(name: string): string | null };

/** Verifica la firma Svix de Resend sobre el cuerpo SIN tocar. Falso si falta, está mal o ha caducado. */
function firmaValida(secret: string, rawBody: string, headers: HeaderBag): boolean {
  try {
    new Webhook(secret).verify(rawBody, {
      "svix-id": headers.get("svix-id") ?? "",
      "svix-timestamp": headers.get("svix-timestamp") ?? "",
      "svix-signature": headers.get("svix-signature") ?? "",
    });
    return true;
  } catch {
    return false;
  }
}

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

  if (!firmaValida(args.secret, args.rawBody, args.headers)) return { status: 400, body: { estado: "firma_no_valida" } };
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

/**
 * Webhook de correo ENTRANTE (`email.received`). Verifica la firma antes de leer nada; un correo recibido es dato
 * no fiable y aquí solo se guarda. Si algo falla al guardar responde 500 para que Resend reintente (es idempotente).
 */
export async function procesarWebhookEntrante(args: {
  secret: string | null;
  rawBody: string;
  headers: HeaderBag;
  deps: InboundDeps;
}): Promise<WebhookResponse> {
  if (!args.secret) return { status: 503, body: { estado: "webhook_sin_configurar" } };
  if (!firmaValida(args.secret, args.rawBody, args.headers)) return { status: 400, body: { estado: "firma_no_valida" } };

  let payload: unknown;
  try {
    payload = JSON.parse(args.rawBody);
  } catch {
    return { status: 400, body: { estado: "evento_no_valido" } };
  }
  try {
    const result = await procesarCorreoRecibido(args.deps, payload as Parameters<typeof procesarCorreoRecibido>[1]);
    return { status: 200, body: { estado: result.estado } };
  } catch (e) {
    if (e instanceof Error && e.name === "ZodError") return { status: 400, body: { estado: "evento_no_valido" } };
    // Sin detalles en la respuesta; el motivo va al registro del servidor (sin el contenido del correo).
    console.error("webhook entrante:", e instanceof Error ? e.message : "error desconocido");
    return { status: 500, body: { estado: "error_interno" } };
  }
}
