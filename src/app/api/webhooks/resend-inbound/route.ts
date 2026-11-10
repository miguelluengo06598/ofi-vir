import { after } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { motorDesdeEntorno } from "@/lib/agents/fromEnv";
import { procesarTareasPendientes } from "@/lib/agentes/traspasos/procesar";
import { emailConfigFromEnv } from "@/lib/email/config";
import { anotarCorreoRecibido } from "@/lib/email/memoryOnReceive";
import { ResendInboundFetcher } from "@/lib/email/receiver";
import { SupabaseEmailStore } from "@/lib/email/supabaseStore";
import { procesarWebhookEntrante } from "@/lib/email/webhook";
import { SupabaseAlmacenEventos } from "@/lib/eventos/servicio";

/**
 * Correos recibidos (evento `email.received` de Resend). La firma se verifica antes de leer nada.
 * El contenido del correo es dato no fiable: aquí solo se guarda, pasa el filtro de eventos (sin IA), se anota en la memoria y, si
 * procede, se crea la tarea del agente con origen `evento_externo`. Después se procesa la cola: el agente lo atiende solo.
 */
export async function POST(req: Request) {
  const store = SupabaseEmailStore.fromEnv();
  if (!store) return Response.json({ estado: "backend_sin_configurar" }, { status: 503 });
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
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
      eventos: new SupabaseAlmacenEventos(db),
    },
  });
  // El evento ya tiene su tarea: se atiende en segundo plano (si no, la recoge el cron `procesar-pendientes`).
  if (status === 200 && body.estado === "guardado") {
    const motor = motorDesdeEntorno();
    if (motor) after(() => procesarTareasPendientes(motor.deps, { maxTareas: 10 }).then(() => undefined).catch((e) => console.error("cola tras correo:", e instanceof Error ? e.message : e)));
  }
  return Response.json(body, { status });
}
