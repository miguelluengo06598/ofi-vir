import { emailConfigFromEnv } from "@/lib/email/config";
import { anotarCorreoRecibido } from "@/lib/email/memoryOnReceive";
import { ResendInboundFetcher } from "@/lib/email/receiver";
import { SupabaseEmailStore } from "@/lib/email/supabaseStore";
import { procesarWebhookEntrante } from "@/lib/email/webhook";

/**
 * Correos recibidos (evento `email.received` de Resend). La firma se verifica antes de leer nada.
 * El contenido del correo es dato no fiable: aquí solo se guarda, se anota en la memoria y se crea una tarea.
 */
export async function POST(req: Request) {
  const store = SupabaseEmailStore.fromEnv();
  if (!store) return Response.json({ estado: "backend_sin_configurar" }, { status: 503 });
  const rawBody = await req.text();
  const { apiKey } = emailConfigFromEnv();
  const { status, body } = await procesarWebhookEntrante({
    // Un endpoint propio en Resend tiene su propio secreto; si usas uno solo para todo, vale RESEND_WEBHOOK_SECRET.
    secret: process.env.RESEND_INBOUND_WEBHOOK_SECRET?.trim() || process.env.RESEND_WEBHOOK_SECRET?.trim() || null,
    rawBody,
    headers: req.headers,
    deps: {
      store,
      fetcher: apiKey ? new ResendInboundFetcher(apiKey) : null,
      defaultCompanyId: process.env.DEV_COMPANY_ID?.trim() || null,
      defaultAgentSlug: process.env.INBOUND_DEFAULT_AGENT_SLUG?.trim() || null,
      alGuardar: anotarCorreoRecibido,
    },
  });
  return Response.json(body, { status });
}
