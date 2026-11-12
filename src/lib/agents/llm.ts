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
  /**
   * Salida estructurada: el modelo debe responder llamando a esta herramienta. En los modelos que no admiten forzarla
   * (Sonnet 5.5, Opus 5.5) el cliente real lo pide en las instrucciones y lo reintenta una vez; el razonamiento se apaga.
   */
  toolChoice?: { type: "tool"; name: string };
  /** Esfuerzo (`output_config.effort`). Sin él: medio (Haiku) o alto (Sonnet) en los agentes, bajo en lo estructurado. */
  esfuerzo?: "low" | "medium" | "high";
  /** En una llamada estructurada, mantener el razonamiento (p. ej. un evaluador que debe pensar). Necesita más `maxTokens`. */
  razonar?: boolean;
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
