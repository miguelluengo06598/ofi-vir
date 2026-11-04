import type { MemoryData } from "@/data/memory";
import { createMemoryService } from "./service.ts";
import { SupabaseMemoryStore } from "./supabaseStore.ts";
import { toMemoryData } from "./toMemoryData.ts";

/**
 * Memoria de la empresa actual para la vista (solo servidor).
 * Devuelve null si el backend no está configurado o no responde: la vista usa entonces los datos de ejemplo.
 * Mientras no haya inicio de sesión, la empresa sale de DEV_COMPANY_ID.
 */
export async function loadMemoryData(): Promise<MemoryData | null> {
  const companyId = process.env.DEV_COMPANY_ID?.trim();
  const store = SupabaseMemoryStore.fromEnv();
  if (!companyId || !store) return null;
  try {
    const graph = await createMemoryService({ store, embedder: null }).loadGraph(companyId);
    const data = toMemoryData(graph);
    return data.nodes.length > 0 ? data : null;
  } catch {
    return null;
  }
}
