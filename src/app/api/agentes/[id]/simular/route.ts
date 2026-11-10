import { depsSimuladorDesdeEntorno, simularHandler } from "@/lib/agentes/simulador/api";

/** Ver src/lib/agentes/simulador/api.ts: simula al agente con su configuración real, sin efectos. La empresa sale de la sesión. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const api = depsSimuladorDesdeEntorno();
  if (!api) return Response.json({ error: "simulador_sin_configurar", mensaje: "El simulador necesita la base de datos y ANTHROPIC_API_KEY." }, { status: 503 });
  return simularHandler(req, (await params).id, api);
}
