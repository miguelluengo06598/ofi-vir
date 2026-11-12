/** Lo que el cliente real envía a la API de Claude según el modelo (SDK simulado, sin red). Ejecutar: npm test */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type Anthropic from "@anthropic-ai/sdk";
import { AnthropicLlm } from "./anthropicClient.ts";
import type { LlmRequest } from "./llm.ts";

type Peticion = Record<string, unknown>;
function sdkFalso(respuestas: object[]) {
  const peticiones: Peticion[] = [];
  const client = { beta: { messages: { create: async (p: Peticion) => { peticiones.push(p); return respuestas.shift(); } } } } as unknown as Anthropic;
  return { llm: new AnthropicLlm(client), peticiones };
}
const uso = { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
const conHerramienta = (name: string) => ({ content: [{ type: "tool_use", id: "t1", name, input: { nota: 9 } }], stop_reason: "tool_use", usage: uso });
const soloTexto = { content: [{ type: "text", text: "Le doy un 9." }], stop_reason: "end_turn", usage: uso };
const base = (model: string, extra: Partial<LlmRequest> = {}): LlmRequest => ({
  model, maxTokens: 500, system: "Puntúa.", tools: [{ name: "puntuar", description: "Puntuación", input_schema: { type: "object", properties: {} } }],
  toolChoice: { type: "tool", name: "puntuar" }, messages: [{ role: "user", content: "Caso" }], ...extra,
});

describe("cliente de Claude", () => {
  it("Sonnet 5.5, salida estructurada: no fuerza la herramienta (daría 400), apaga el razonamiento con between_tools y lleva respaldo", async () => {
    const { llm, peticiones } = sdkFalso([conHerramienta("puntuar")]);
    await llm.create(base("claude-sonnet-5-5"));
    const p = peticiones[0];
    assert.deepEqual(p.tool_choice, { type: "auto" });
    assert.deepEqual(p.thinking, { type: "between_tools" });
    assert.deepEqual(p.output_config, { effort: "low" });
    assert.equal(p.fallbacks, "default");
    assert.deepEqual(p.betas, ["server-side-fallback-2026-07-01"]);
    assert.match(String(p.system), /herramienta «puntuar»/);
  });

  it("si Sonnet contesta con texto en vez de la herramienta, se le pide una vez más y se suman los tokens", async () => {
    const { llm, peticiones } = sdkFalso([soloTexto, conHerramienta("puntuar")]);
    const r = await llm.create(base("claude-sonnet-5-5"));
    assert.equal(peticiones.length, 2);
    assert.equal(r.content[0].type, "tool_use");
    assert.equal(r.usage.inputTokens, 20);
    const ultima = (peticiones[1].messages as { role: string }[]).at(-1)!;
    assert.equal(ultima.role, "user");
  });

  it("Haiku 5.5, salida estructurada: sí fuerza la herramienta, razonamiento desactivado y sin respaldo", async () => {
    const { llm, peticiones } = sdkFalso([conHerramienta("puntuar")]);
    await llm.create(base("claude-haiku-5-5"));
    const p = peticiones[0];
    assert.deepEqual(p.tool_choice, { type: "tool", name: "puntuar" });
    assert.deepEqual(p.thinking, { type: "disabled" });
    assert.equal(p.fallbacks, undefined);
  });

  it("un evaluador que debe pensar mantiene el razonamiento", async () => {
    const { llm, peticiones } = sdkFalso([conHerramienta("puntuar")]);
    await llm.create(base("claude-sonnet-5-5", { razonar: true, esfuerzo: "medium", maxTokens: 4000 }));
    assert.equal(peticiones[0].thinking, undefined);
    assert.deepEqual(peticiones[0].output_config, { effort: "medium" });
  });

  it("en el bucle de un agente: razonamiento adaptativo (sin tocar), esfuerzo medio en Haiku y alto en Sonnet, y los bloques vuelven intactos", async () => {
    const respuesta = { content: [{ type: "thinking", thinking: "", signature: "abc" }, { type: "text", text: "Hecho." }], stop_reason: "end_turn", usage: uso };
    const { llm, peticiones } = sdkFalso([respuesta, { ...respuesta }]);
    const r = await llm.create(base("claude-haiku-5-5", { toolChoice: undefined }));
    await llm.create(base("claude-sonnet-5-5", { toolChoice: undefined }));
    assert.equal(peticiones[0].thinking, undefined);
    assert.equal(peticiones[0].tool_choice, undefined);
    assert.deepEqual(peticiones[0].output_config, { effort: "medium" });
    assert.deepEqual(peticiones[1].output_config, { effort: "high" });
    assert.deepEqual(r.content[0], { type: "thinking", thinking: "", signature: "abc" });
  });

  it("una clave de ejemplo no crea cliente (mejor «sin motor» que un 401 en cada tarea)", () => {
    const previa = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = "sk-ant-mock-0000";
    assert.equal(AnthropicLlm.fromEnv(), null);
    process.env.ANTHROPIC_API_KEY = "sk-ant-api03-verdadera";
    assert.ok(AnthropicLlm.fromEnv());
    if (previa === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = previa;
  });
});
