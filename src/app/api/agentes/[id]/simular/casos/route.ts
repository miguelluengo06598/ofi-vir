import { casosHandler, depsSimuladorDesdeEntorno } from "@/lib/agentes/simulador/api";

/** Ejecuta los casos de prueba de la plantilla del agente en el simulador y marca cuáles cumplen. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const api = depsSimuladorDesdeEntorno();
  if (!api) return Response.json({ error: "simulador_sin_configurar", mensaje: "El simulador necesita la base de datos y ANTHROPIC_API_KEY." }, { status: 503 });
  return casosHandler(req, (await params).id, api);
}
