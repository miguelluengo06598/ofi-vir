import { SupabaseMemoryStore } from "../memory/supabaseStore.ts";
import { embedderFromEnv } from "../memory/embedderFromEnv.ts";
import { createMemoryService } from "../memory/service.ts";
import { AnthropicLlm } from "./anthropicClient.ts";
import type { EngineDeps } from "./loop.ts";
import { SupabaseAgentStore } from "./supabaseStore.ts";

/** Motor con todo conectado (Supabase, memoria, Claude). null si falta la base o la clave de Anthropic. */
export function motorDesdeEntorno(): { deps: EngineDeps; store: SupabaseAgentStore } | null {
  const store = SupabaseAgentStore.fromEnv();
  const memStore = SupabaseMemoryStore.fromEnv();
  const llm = AnthropicLlm.fromEnv();
  if (!store || !memStore || !llm) return null;
  return { store, deps: { store, memory: createMemoryService({ store: memStore, embedder: embedderFromEnv() }), contacts: memStore, llm } };
}
