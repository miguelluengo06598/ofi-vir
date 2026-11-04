import { EMBEDDING_DIMENSIONS, type Embedder, type EmbedKind } from "./embedder.ts";

/**
 * Embedder falso para tests: determinista y sin red. Cada palabra (sin tildes, en minúsculas) suma en
 * una posición fija del vector; los textos con palabras en común quedan cerca. Vectores normalizados.
 */
export class FakeEmbedder implements Embedder {
  readonly model = "fake";
  readonly dimensions = EMBEDDING_DIMENSIONS;
  calls: { texts: string[]; kind: EmbedKind }[] = [];

  async embed(texts: string[], kind: EmbedKind): Promise<number[][]> {
    this.calls.push({ texts, kind });
    return texts.map((t) => this.vector(t));
  }

  private vector(text: string): number[] {
    const v = new Array<number>(this.dimensions).fill(0);
    const words = text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().match(/[a-z0-9]+/g) ?? [];
    for (const w of words) v[hash(w) % this.dimensions] += 1;
    const norm = Math.hypot(...v) || 1;
    return v.map((x) => x / norm);
  }
}

const hash = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
};
