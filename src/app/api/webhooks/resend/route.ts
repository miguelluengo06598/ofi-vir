import { anotarCorreoNoValido } from "@/lib/email/memoryOnBounce";
import { SupabaseEmailStore } from "@/lib/email/supabaseStore";
import { procesarWebhookResend } from "@/lib/email/webhook";

/** Avisos de entrega de Resend (entregado, rebotado, spam). La firma se verifica antes de leer nada. */
export async function POST(req: Request) {
  const store = SupabaseEmailStore.fromEnv();
  if (!store) return Response.json({ estado: "backend_sin_configurar" }, { status: 503 });
  const rawBody = await req.text();
  const { status, body } = await procesarWebhookResend({
    secret: process.env.RESEND_WEBHOOK_SECRET?.trim() || null,
    rawBody,
    headers: req.headers,
    store,
    alRebotar: anotarCorreoNoValido,
  });
  return Response.json(body, { status });
}
