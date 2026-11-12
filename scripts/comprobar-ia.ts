/**
 * npm run comprobar:ia — comprueba con las claves REALES que la IA de la plataforma funciona:
 *   1. Haiku 5.5 como agente (texto, razonamiento adaptativo).
 *   2. Haiku 5.5 con salida estructurada (herramienta forzada, razonamiento desactivado).
 *   3. Sonnet 5.5 con salida estructurada (herramienta en automático + respaldo ante rechazos).
 *   4. Voyage (vector de 1024 dimensiones para la memoria), si hay VOYAGE_API_KEY.
 * Gasta muy poco (unos céntimos de dólar) y no toca la base de datos. Usa las variables de .env.local.
 */
import { AnthropicLlm } from "../src/lib/agents/anthropicClient.ts";
import { MODELOS } from "../src/lib/creditos/tarifas.ts";
import { embedderFromEnv } from "../src/lib/memory/embedderFromEnv.ts";

const ok = (t: string) => console.log(`✓ ${t}`);
const mal = (t: string) => { console.log(`✖ ${t}`); process.exitCode = 1; };

const llm = AnthropicLlm.fromEnv();
if (!llm) {
  mal("ANTHROPIC_API_KEY falta o es de ejemplo: los agentes no pueden trabajar.");
} else {
  const herramienta = { name: "clasificar", description: "Clasifica el mensaje.", input_schema: { type: "object", properties: { tipo: { type: "string", enum: ["consulta", "queja", "otro"] } }, required: ["tipo"], additionalProperties: false } };
  const pruebas: [string, () => Promise<{ ok: boolean; detalle: string }>][] = [
    ["Haiku 5.5 como agente", async () => {
      const r = await llm.create({ model: MODELOS.haiku, maxTokens: 2000, system: "Eres un asistente de pruebas. Responde en una frase.", tools: [], messages: [{ role: "user", content: "Di «hola» en español." }] });
      const texto = r.content.filter((b) => b.type === "text").map((b) => String(b.text)).join(" ");
      return { ok: r.stopReason === "end_turn" && texto.length > 0, detalle: `${r.stopReason}, ${r.usage.inputTokens}+${r.usage.outputTokens} tokens` };
    }],
    ...[MODELOS.haiku, MODELOS.sonnet].map((model) => [`${model} con salida estructurada`, async () => {
      const r = await llm.create({ model, maxTokens: 500, system: "Clasifica el mensaje del cliente.", tools: [herramienta], toolChoice: { type: "tool", name: "clasificar" }, messages: [{ role: "user", content: "El pedido llegó roto y nadie me contesta." }] });
      const uso = r.content.find((b) => b.type === "tool_use" && b.name === "clasificar") as { input?: { tipo?: string } } | undefined;
      return { ok: Boolean(uso?.input?.tipo), detalle: `tipo=${uso?.input?.tipo ?? "(sin herramienta)"}, ${r.stopReason}` };
    }] as [string, () => Promise<{ ok: boolean; detalle: string }>]),
  ];
  for (const [nombre, prueba] of pruebas) {
    try {
      const r = await prueba();
      (r.ok ? ok : mal)(`${nombre}: ${r.detalle}`);
    } catch (e) {
      const s = e as { status?: number; error?: { error?: { type?: string } } };
      mal(`${nombre}: error ${s.status ?? ""} ${s.error?.error?.type ?? (e instanceof Error ? e.name : "")}`.trim());
    }
  }
}

const embedder = embedderFromEnv();
if (!embedder) {
  mal("VOYAGE_API_KEY falta: la memoria no puede buscar ni guardar (los agentes fallarán en buscar_en_memoria y guardar_recuerdo).");
} else {
  try {
    const [v] = await embedder.embed(["prueba de la memoria"], "document");
    (v?.length === 1024 ? ok : mal)(`Voyage: vector de ${v?.length ?? 0} dimensiones`);
  } catch (e) {
    mal(`Voyage: ${e instanceof Error ? e.message.slice(0, 120) : "error"}`);
  }
}
