import { cancelarHandler, depsCicloDesdeEntorno } from "@/lib/agentes/versiones/api";

/** Cancela la solicitud de certificación en curso de un agente. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const api = depsCicloDesdeEntorno();
  if (!api) return Response.json({ error: "backend_sin_configurar" }, { status: 503 });
  return cancelarHandler(req, (await params).id, api);
}
