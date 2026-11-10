/** Origen de las tareas de las pruebas contra la base: un evento externo registrado (un mensaje que llega de fuera). */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { OrigenNuevo } from "../../src/lib/agents/store.ts";

export async function origenDeEvento(db: SupabaseClient, companyId: string, canal: "whatsapp" | "formulario" | "meta_lead" | "otro" = "whatsapp"): Promise<OrigenNuevo> {
  const { data, error } = await db.from("eventos_externos").insert({ company_id: companyId, canal, estado: "aceptado" }).select("id").single();
  if (error || !data) throw new Error(`No se pudo registrar el evento de prueba: ${error?.message}`);
  return { tipo: "evento_externo", eventoId: data.id as string, canal };
}
