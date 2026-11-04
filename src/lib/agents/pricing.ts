import type { LlmUsage } from "./llm.ts";

/** Tarifa en euros por millón de tokens (tabla `model_pricing`). */
export type Pricing = { inputEur: number; outputEur: number; cacheReadEur: number; cacheWriteEur: number };

/** Mismo cálculo que el disparador `tasks_compute_cost` de la base (la base es la fuente de verdad del total de la tarea). */
export function costeEur(u: LlmUsage, p: Pricing): number {
  const raw =
    (u.inputTokens / 1e6) * p.inputEur +
    (u.outputTokens / 1e6) * p.outputEur +
    (u.cacheReadTokens / 1e6) * p.cacheReadEur +
    (u.cacheWriteTokens / 1e6) * p.cacheWriteEur;
  return Math.round(raw * 1e6) / 1e6;
}

export const sumarUso = (a: LlmUsage, b: LlmUsage): LlmUsage => ({
  inputTokens: a.inputTokens + b.inputTokens,
  outputTokens: a.outputTokens + b.outputTokens,
  cacheReadTokens: a.cacheReadTokens + b.cacheReadTokens,
  cacheWriteTokens: a.cacheWriteTokens + b.cacheWriteTokens,
});

export const USO_VACIO: LlmUsage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
