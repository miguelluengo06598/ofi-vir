import { z } from "zod";
import { EMBEDDING_DIMENSIONS, type Embedder, type EmbedKind } from "./embedder.ts";

const ENDPOINT = "https://api.voyageai.com/v1/embeddings";
const MODEL = "voyage-3.5";
const MAX_BATCH = 128;

const responseSchema = z.object({
  data: z.array(z.object({ index: z.number().int(), embedding: z.array(z.number()) })),
});

/** Embedder de Voyage. Solo servidor. Los errores no incluyen el cuerpo de la respuesta ni la clave. */
export class VoyageEmbedder implements Embedder {
  readonly model = MODEL;
  readonly dimensions = EMBEDDING_DIMENSIONS;

  private readonly apiKey: string;
  private readonly fetchImpl: typeof fetch;

  constructor(apiKey: string, fetchImpl: typeof fetch = fetch) {
    if (!apiKey.trim()) throw new Error("Falta la clave de Voyage (VOYAGE_API_KEY).");
    this.apiKey = apiKey;
    this.fetchImpl = fetchImpl;
  }

  async embed(texts: string[], kind: EmbedKind): Promise<number[][]> {
    const out: number[][] = [];
    for (let i = 0; i < texts.length; i += MAX_BATCH) out.push(...(await this.batch(texts.slice(i, i + MAX_BATCH), kind)));
    return out;
  }

  private async batch(texts: string[], kind: EmbedKind): Promise<number[][]> {
    const res = await this.fetchImpl(ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ input: texts, model: MODEL, input_type: kind, output_dimension: this.dimensions }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`Voyage respondió con HTTP ${res.status}.`);
    const parsed = responseSchema.safeParse(await res.json());
    if (!parsed.success || parsed.data.data.length !== texts.length) throw new Error("Respuesta de Voyage no válida.");
    const sorted = [...parsed.data.data].sort((a, b) => a.index - b.index).map((d) => d.embedding);
    if (sorted.some((v) => v.length !== this.dimensions)) throw new Error("Voyage devolvió vectores con otra dimensión.");
    return sorted;
  }
}
