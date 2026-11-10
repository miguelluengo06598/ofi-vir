import { aplicarHandler, depsAsistenteDesdeEntorno } from "@/lib/agentes/asistente/api";

/** Aplica la propuesta guardada en la conversación (o solo los campos marcados) y crea una versión nueva del agente. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const api = depsAsistenteDesdeEntorno();
  if (!api) return Response.json({ error: "backend_sin_configurar" }, { status: 503 });
  return aplicarHandler(req, (await params).id, api);
}
