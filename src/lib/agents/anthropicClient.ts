import Anthropic from "@anthropic-ai/sdk";
import type { LlmClient, LlmRequest, LlmResponse } from "./llm.ts";

/** Cliente real sobre la API de Claude. La clave solo existe en el servidor (ANTHROPIC_API_KEY). */
export class AnthropicLlm implements LlmClient {
  private readonly client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  static fromEnv(): AnthropicLlm | null {
    const key = process.env.ANTHROPIC_API_KEY?.trim();
    return key ? new AnthropicLlm(key) : null;
  }

  async create(req: LlmRequest): Promise<LlmResponse> {
    const response = await this.client.messages.create({
      model: req.model,
      max_tokens: req.maxTokens,
      system: req.system,
      ...(req.tools.length ? { tools: req.tools as Anthropic.Messages.Tool[] } : {}),
      messages: req.messages as Anthropic.Messages.MessageParam[],
      // Caché automática: el prefijo (herramientas + instrucciones + mensajes anteriores) se reutiliza en cada vuelta del bucle.
      cache_control: { type: "ephemeral" },
    });
    return {
      content: response.content as unknown as LlmResponse["content"],
      stopReason: response.stop_reason,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
        cacheWriteTokens: response.usage.cache_creation_input_tokens ?? 0,
      },
    };
  }
}
