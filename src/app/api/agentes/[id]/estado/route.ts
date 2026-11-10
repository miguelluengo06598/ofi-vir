import { depsCicloDesdeEntorno, estadoHandler } from "@/lib/agentes/versiones/api";

/** Activar (solo con certificación vigente), pausar o archivar un agente. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const api = depsCicloDesdeEntorno();
  if (!api) return Response.json({ error: "backend_sin_configurar" }, { status: 503 });
  return estadoHandler(req, (await params).id, api);
}
