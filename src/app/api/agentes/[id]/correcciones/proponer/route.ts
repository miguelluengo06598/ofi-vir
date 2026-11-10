import { depsCicloDesdeEntorno, proponerCorreccionHandler } from "@/lib/agentes/versiones/api";

/** Claude Haiku resume en una regla corta la diferencia entre la respuesta del agente y la corregida. No guarda nada. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const api = depsCicloDesdeEntorno();
  if (!api) return Response.json({ error: "backend_sin_configurar" }, { status: 503 });
  return proponerCorreccionHandler(req, (await params).id, api);
}
