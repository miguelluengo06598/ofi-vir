/** Cliente del modelo, mínimo e inyectable: el motor no depende del SDK, así los tests usan un modelo guionizado. */

export type LlmTool = { name: string; description: string; input_schema: Record<string, unknown> };
export type LlmBlock = { type: string; [key: string]: unknown };
export type LlmMessage = { role: "user" | "assistant"; content: string | LlmBlock[] };

export type LlmRequest = {
  model: string;
  maxTokens: number;
  /** Instrucciones fijas del agente (se cachean: salen más baratas a partir de la segunda llamada). */
  system: string;
  tools: LlmTool[];
  messages: LlmMessage[];
};

export type LlmUsage = {
  /** Tokens de entrada NO cacheados (como los da la API). */
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
};

export type LlmResponse = {
  /** Bloques tal cual los devolvió el modelo (incluidos los de razonamiento): se reenvían sin tocar. */
  content: LlmBlock[];
  stopReason: string | null;
  usage: LlmUsage;
};

export interface LlmClient {
  create(request: LlmRequest): Promise<LlmResponse>;
}
