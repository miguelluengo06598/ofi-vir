/**
 * Interfaz intercambiable de embeddings. El servicio de memoria solo conoce esto:
 * cambiar de proveedor (p. ej. BGE-M3 alojado) es escribir otra implementación.
 */

/** Debe coincidir con `vector(1024)` en `memory_nodes`. */
export const EMBEDDING_DIMENSIONS = 1024;

/** `document` para lo que se guarda; `query` para lo que se busca (los modelos lo tratan distinto). */
export type EmbedKind = "document" | "query";

export interface Embedder {
  readonly model: string;
  readonly dimensions: number;
  /** Un vector por texto, en el mismo orden. */
  embed(texts: string[], kind: EmbedKind): Promise<number[][]>;
}
