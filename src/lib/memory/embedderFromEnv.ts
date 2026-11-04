import type { Embedder } from "./embedder.ts";
import { VoyageEmbedder } from "./voyageEmbedder.ts";

/** Embedder según el entorno; null si falta la clave (la memoria sigue leyéndose, pero no se puede buscar ni guardar). */
export const embedderFromEnv = (): Embedder | null => {
  const key = process.env.VOYAGE_API_KEY?.trim();
  return key ? new VoyageEmbedder(key) : null;
};
