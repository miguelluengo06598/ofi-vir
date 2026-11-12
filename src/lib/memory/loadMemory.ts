import type { MemoryData } from "@/data/memory";
import { createMemoryService } from "./service.ts";
import { SupabaseMemoryStore } from "./supabaseStore.ts";
import { toMemoryData } from "./toMemoryData.ts";

/**
 * Memoria de la empresa de la sesión para la vista (solo servidor). Nunca se rellena con ejemplos: sin recuerdos,
 * devuelve una memoria vacía; si la base no responde, null (la vista lo dice).
 */
export async function loadMemoryData(companyId: string): Promise<MemoryData | null> {
  const store = SupabaseMemoryStore.fromEnv();
  if (!store) return null;
  try {
    return toMemoryData(await createMemoryService({ store, embedder: null }).loadGraph(companyId));
  } catch (e) {
    console.error("loadMemoryData:", e instanceof Error ? e.message : "error desconocido");
    return null;
  }
}
