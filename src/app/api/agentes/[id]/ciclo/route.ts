import { cicloHandler, depsCicloDesdeEntorno } from "@/lib/agentes/versiones/api";

/** Estado del agente, lo que falta para certificarlo, la solicitud en curso y si hay una versión nueva de su plantilla. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const api = depsCicloDesdeEntorno();
  if (!api) return Response.json({ error: "backend_sin_configurar" }, { status: 503 });
  return cicloHandler(req, (await params).id, api);
}
