import type { LlmClient, LlmRequest, LlmResponse, LlmUsage } from "./llm.ts";

/** Modelo guionizado para tests y pruebas de extremo a extremo: devuelve las respuestas en orden y guarda lo recibido. */
export class ScriptedLlm implements LlmClient {
  requests: LlmRequest[] = [];
  script: (LlmResponse | Error)[];
  constructor(script: (LlmResponse | Error)[]) {
    this.script = script;
  }
  async create(req: LlmRequest): Promise<LlmResponse> {
    this.requests.push(structuredClone(req));
    const next = this.script.shift();
    if (!next) throw new Error("guion agotado");
    if (next instanceof Error) throw next;
    return next;
  }
}

export const uso = (i: number, o: number, r = 0, w = 0): LlmUsage => ({ inputTokens: i, outputTokens: o, cacheReadTokens: r, cacheWriteTokens: w });

/** Respuesta del modelo que pide una herramienta. */
export const llamada = (id: string, name: string, input: unknown, usage: LlmUsage = uso(1000, 200)): LlmResponse => ({
  content: [{ type: "thinking", thinking: "…", signature: "sig" }, { type: "text", text: `Uso ${name}` }, { type: "tool_use", id, name, input }],
  stopReason: "tool_use",
  usage,
});

/** Respuesta final del modelo. */
export const fin = (text: string, usage: LlmUsage = uso(1500, 300)): LlmResponse => ({ content: [{ type: "text", text }], stopReason: "end_turn", usage });
