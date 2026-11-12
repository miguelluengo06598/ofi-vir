import Anthropic from "@anthropic-ai/sdk";
import type { LlmBlock, LlmClient, LlmRequest, LlmResponse, LlmSystemBlock, LlmUsage } from "./llm.ts";

/**
 * Cliente real sobre la API de Claude: el ÚNICO sitio de la plataforma que habla con Anthropic. La clave solo existe en
 * el servidor (ANTHROPIC_API_KEY) y nunca llega al navegador ni a los registros.
 *
 * Lo que adapta a los modelos actuales (Haiku 5.5 y Sonnet 5.5):
 *  - Salida estructurada (`toolChoice`): Sonnet 5.5 (como Opus 5.5 y Fable) devuelve 400 si se FUERZA una herramienta.
 *    Ahí se deja `tool_choice: auto`, se pide en las instrucciones que responda con esa herramienta y, si no la usa, se
 *    le pide una vez más. Haiku 5.5 sí acepta forzarla.
 *  - Razonamiento: en las dos está activado por defecto y gasta tokens de salida. En las llamadas estructuradas (cortas)
 *    se apaga (Haiku: `disabled`; Sonnet 5.5: `between_tools`, porque `disabled` da 400) para que no se coma el
 *    `max_tokens` antes de la respuesta. En el bucle de los agentes se deja adaptativo.
 *  - Esfuerzo explícito (`output_config.effort`): el valor por defecto cambia según el modelo; aquí se fija.
 *  - Sonnet 5.5 con respaldo en el servidor ante rechazos por error de los filtros de seguridad (`fallbacks: "default"`):
 *    si uno salta por error, la API reintenta en otro modelo dentro de la misma llamada.
 *  - Tiempo máximo por llamada y reintentos (429, 5xx y red) con los del SDK.
 * Los bloques de la respuesta se devuelven TAL CUAL (también los de razonamiento y los de respaldo): el motor los
 * reenvía sin tocar, como exige la API.
 */
const SIN_HERRAMIENTA_FORZADA = /^claude-(opus-5-5|sonnet-5-5|fable-|mythos-)/;
const CON_RESPALDO_EN_SERVIDOR = /^claude-(sonnet-5-5|opus-5-5|opus-5$|fable-5-[12])/;
const TIEMPO_MAXIMO_MS = 120_000;

type Esfuerzo = NonNullable<LlmRequest["esfuerzo"]>;

/** Razonamiento apagado, si el modelo lo permite (ver la tabla de la API: cada modelo lo apaga de una forma). */
function razonamientoApagado(model: string): Anthropic.Beta.Messages.BetaThinkingConfigParam | undefined {
  if (model.startsWith("claude-haiku-5-5")) return { type: "disabled" };
  if (model.startsWith("claude-sonnet-5-5")) return { type: "between_tools" };
  return undefined; // Opus 5.5 / Fable: no se puede apagar; se baja el esfuerzo
}

/** Esfuerzo por defecto: medio en el trabajo de los agentes; bajo en las llamadas estructuradas (clasificar, puntuar). */
export function esfuerzoPorDefecto(model: string, estructurada: boolean): Esfuerzo {
  if (estructurada) return "low";
  return model.startsWith("claude-sonnet") ? "high" : "medium";
}

export class AnthropicLlm implements LlmClient {
  private readonly client: Anthropic;

  /** Con una clave crea el cliente del SDK; las pruebas pasan un cliente simulado. */
  constructor(clave: string | Anthropic) {
    this.client = typeof clave === "string" ? new Anthropic({ apiKey: clave, timeout: TIEMPO_MAXIMO_MS, maxRetries: 2 }) : clave;
  }

  static fromEnv(): AnthropicLlm | null {
    const key = process.env.ANTHROPIC_API_KEY?.trim();
    // Una clave de ejemplo («sk-ant-mock…») no es una clave: mejor «sin motor» que errores 401 en cada tarea.
    return key && !/mock|ejemplo|xxxx/i.test(key) ? new AnthropicLlm(key) : null;
  }

  async create(req: LlmRequest): Promise<LlmResponse> {
    const herramienta = req.toolChoice?.name ?? null;
    const forzable = !SIN_HERRAMIENTA_FORZADA.test(req.model);
    const aviso = herramienta && !forzable
      ? `Responde únicamente llamando a la herramienta «${herramienta}» con tu resultado. No escribas texto fuera de esa herramienta.`
      : null;
    const system: string | LlmSystemBlock[] = aviso
      ? req.systemBlocks ? [...req.systemBlocks, { type: "text", text: aviso }] : `${req.system}\n\n${aviso}`
      : req.systemBlocks ?? req.system;

    const pedir = (messages: LlmRequest["messages"]) => this.llamar(req, system, messages, herramienta && forzable ? req.toolChoice! : herramienta ? { type: "auto" } : null);
    let r = await pedir(req.messages);
    // Sin herramienta forzada, el modelo puede contestar con texto: se le pide una vez más que use la herramienta.
    if (herramienta && !forzable && r.stopReason !== "refusal" && !r.content.some((b) => b.type === "tool_use" && b.name === herramienta)) {
      const segunda = await pedir([
        ...req.messages,
        { role: "assistant", content: r.content },
        { role: "user", content: `Da tu respuesta llamando a la herramienta «${herramienta}».` },
      ]);
      r = { ...segunda, usage: sumar(r.usage, segunda.usage) };
    }
    return r;
  }

  private async llamar(req: LlmRequest, system: string | LlmSystemBlock[], messages: LlmRequest["messages"], toolChoice: { type: "tool"; name: string } | { type: "auto" } | null): Promise<LlmResponse> {
    const estructurada = req.toolChoice !== undefined;
    const thinking = estructurada && !req.razonar ? razonamientoApagado(req.model) : undefined;
    const respaldo = CON_RESPALDO_EN_SERVIDOR.test(req.model);
    const response = await this.client.beta.messages.create({
      model: req.model,
      max_tokens: req.maxTokens,
      system: system as Anthropic.Beta.Messages.MessageCreateParams["system"],
      ...(req.tools.length ? { tools: req.tools as Anthropic.Beta.Messages.BetaTool[] } : {}),
      ...(toolChoice ? { tool_choice: toolChoice } : {}),
      ...(thinking ? { thinking } : {}),
      output_config: { effort: req.esfuerzo ?? esfuerzoPorDefecto(req.model, estructurada && !req.razonar) },
      messages: messages as Anthropic.Beta.Messages.BetaMessageParam[],
      // Caché automática: el prefijo (herramientas + instrucciones + mensajes anteriores) se reutiliza en cada vuelta del bucle.
      cache_control: { type: "ephemeral" },
      ...(respaldo ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
    });
    return {
      content: response.content as unknown as LlmBlock[],
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

const sumar = (a: LlmUsage, b: LlmUsage): LlmUsage => ({
  inputTokens: a.inputTokens + b.inputTokens, outputTokens: a.outputTokens + b.outputTokens,
  cacheReadTokens: a.cacheReadTokens + b.cacheReadTokens, cacheWriteTokens: a.cacheWriteTokens + b.cacheWriteTokens,
});
