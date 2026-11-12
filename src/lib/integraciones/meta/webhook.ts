/**
 * Avisos de Meta («webhook» de la página, campo `leadgen`). SOLO SERVIDOR.
 *
 *  - GET: verificación de la suscripción. Meta envía `hub.mode=subscribe`, `hub.verify_token` y `hub.challenge`; se
 *    devuelve el challenge solo si el token coincide con META_WEBHOOK_VERIFY_TOKEN (comparación en tiempo constante).
 *  - POST: cada aviso llega firmado en `X-Hub-Signature-256: sha256=<HMAC-SHA256 del cuerpo EN BRUTO con el secreto de
 *    la app>`. La firma se comprueba ANTES de leer el JSON. Sin firma válida no se guarda nada.
 *  - Aquí solo se REGISTRA el aviso (identificadores, nunca datos personales) con `meta_lead_registrar`, que es
 *    idempotente: Meta reintenta hasta 36 h y puede repetir. Leer el lead y pasarlo al agente es otro paso.
 *  - Se responde 200 siempre que la firma sea válida, aunque un aviso concreto no se pueda guardar: si no, Meta
 *    reintenta el lote entero y acaba desactivando la suscripción.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

export type DepsWebhookMeta = { db: SupabaseClient; env: Record<string, string | undefined>; log: Pick<Console, "info" | "warn" | "error"> };

const MAX_CUERPO = 1_000_000; // Meta agrupa hasta 1.000 avisos; un cuerpo mayor no es suyo
const iguales = (a: string, b: string) => {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};
const texto = (cuerpo: string, status: number) => new Response(cuerpo, { status, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });

/** GET /api/webhooks/meta — Meta comprueba que la dirección es nuestra. */
export function verificarSuscripcion(url: URL, env: Record<string, string | undefined>): Response {
  const esperado = env.META_WEBHOOK_VERIFY_TOKEN?.trim();
  if (!esperado || esperado.length < 16) return texto("sin configurar", 503);
  const reto = url.searchParams.get("hub.challenge") ?? "";
  if (url.searchParams.get("hub.mode") !== "subscribe" || !iguales(url.searchParams.get("hub.verify_token") ?? "", esperado) || !/^[\w-]{1,200}$/.test(reto)) return texto("no autorizado", 403);
  return texto(reto, 200);
}

export function firmaValida(cuerpoEnBruto: string, cabecera: string | null, appSecret: string): boolean {
  const recibida = /^sha256=([0-9a-f]{64})$/.exec(cabecera ?? "")?.[1];
  if (!recibida) return false;
  return iguales(recibida, createHmac("sha256", appSecret).update(cuerpoEnBruto, "utf8").digest("hex"));
}

const Id = z.string().regex(/^[0-9]{1,32}$/);
const IdOpcional = z.union([Id, z.number().int().nonnegative().transform(String)]).optional().catch(undefined);
const Aviso = z.object({
  object: z.string(),
  entry: z.array(z.object({
    changes: z.array(z.object({ field: z.string(), value: z.unknown() })).max(1000).optional(),
  })).max(1000),
});
const Leadgen = z.object({
  leadgen_id: z.union([Id, z.number().int().positive().transform(String)]),
  page_id: z.union([Id, z.number().int().positive().transform(String)]),
  form_id: IdOpcional, ad_id: IdOpcional, adgroup_id: IdOpcional,
  created_time: z.number().int().positive().optional().catch(undefined),
});

/** POST /api/webhooks/meta — registra los avisos de leads nuevos. */
export async function recibirAvisos(d: DepsWebhookMeta, cuerpoEnBruto: string, cabeceras: Pick<Headers, "get">): Promise<Response> {
  const secreto = d.env.META_APP_SECRET?.trim();
  if (!secreto) return Response.json({ estado: "sin_configurar" }, { status: 503 });
  if (cuerpoEnBruto.length > MAX_CUERPO) return Response.json({ estado: "demasiado_grande" }, { status: 413 });
  if (!firmaValida(cuerpoEnBruto, cabeceras.get("x-hub-signature-256"), secreto)) return Response.json({ estado: "firma_no_valida" }, { status: 401 });

  let json: unknown;
  try { json = JSON.parse(cuerpoEnBruto); } catch { return Response.json({ estado: "ignorado" }); }
  const aviso = Aviso.safeParse(json);
  if (!aviso.success || aviso.data.object !== "page") return Response.json({ estado: "ignorado" });

  let nuevos = 0, repetidos = 0, descartados = 0, fallidos = 0;
  for (const entrada of aviso.data.entry) {
    for (const cambio of entrada.changes ?? []) {
      if (cambio.field !== "leadgen") continue;
      const v = Leadgen.safeParse(cambio.value);
      if (!v.success) { descartados++; continue; }
      const { data, error } = await d.db.rpc("meta_lead_registrar", {
        p_page_id: v.data.page_id, p_form_id: v.data.form_id ?? null, p_leadgen_id: v.data.leadgen_id, p_ad_id: v.data.ad_id ?? null, p_adgroup_id: v.data.adgroup_id ?? null,
        p_created_time: v.data.created_time ? new Date(v.data.created_time * 1000).toISOString() : null,
      });
      if (error) { fallidos++; d.log.error(`[meta] no se pudo registrar un aviso de lead (${error.code ?? "error"}).`); continue; }
      const r = data as { nuevo?: boolean; estado?: string } | null;
      if (r?.nuevo === false) repetidos++; else if (r?.estado === "ignorado") descartados++; else nuevos++;
    }
  }
  if (nuevos || fallidos) d.log.info(`[meta] avisos de leads: ${nuevos} nuevos, ${repetidos} repetidos, ${descartados} descartados, ${fallidos} con error.`);
  return Response.json({ estado: "recibido", nuevos, repetidos, descartados });
}
