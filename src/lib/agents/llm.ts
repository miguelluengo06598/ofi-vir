/** Cliente del modelo, mínimo e inyectable: el motor no depende del SDK, así los tests usan un modelo guionizado. */

export type LlmTool = { name: string; description: string; input_schema: Record<string, unknown> };
export type LlmBlock = { type: string; [key: string]: unknown };
export type LlmMessage = { role: "user" | "assistant"; content: string | LlmBlock[] };

/** Bloque del mensaje de sistema. `cache_control` marca un punto de caché: se cachea todo el prefijo hasta ese bloque. */
export type LlmSystemBlock = { type: "text"; text: string; cache_control?: { type: "ephemeral"; ttl?: "5m" | "1h" } };

export type LlmRequest = {
  model: string;
  maxTokens: number;
  /** Instrucciones fijas del agente (se cachean: salen más baratas a partir de la segunda llamada). */
  system: string;
  /**
   * Mismo mensaje de sistema, en bloques con puntos de caché (`cache_control`). Si está presente, el cliente real envía
   * estos bloques en vez de `system`; `system` conserva el texto plano (registro, pruebas, modelos guionizados).
   */
  systemBlocks?: LlmSystemBlock[];
  tools: LlmTool[];
  /** Obliga al modelo a llamar a una herramienta concreta (salida estructurada). */
  toolChoice?: { type: "tool"; name: string };
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
