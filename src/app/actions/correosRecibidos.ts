"use server";

import { devContext } from "@/lib/devContext";
import type { LiveMessage } from "@/lib/email/inboundStore";
import { SupabaseEmailStore } from "@/lib/email/supabaseStore";

/**
 * Últimos correos recibidos de la empresa (para el panel «En directo» y la pestaña Correos).
 * Devuelve texto plano de contenido externo: la interfaz lo muestra como texto, nunca como HTML.
 */
export async function correosRecibidos(): Promise<LiveMessage[]> {
  const ctx = devContext();
  const store = SupabaseEmailStore.fromEnv();
  if (!ctx || !store) return [];
  try {
    return await store.listLive(ctx.companyId, 20);
  } catch (e) {
    console.error("correosRecibidos:", e instanceof Error ? e.message : "error desconocido");
    return [];
  }
}
