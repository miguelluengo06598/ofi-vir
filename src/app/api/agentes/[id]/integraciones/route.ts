import { depsConexionesDesdeEntorno, faltantesHandler } from "@/lib/integraciones/api";

/** «Falta conectar X»: aplicaciones que el agente necesita y no están conectadas. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const api = depsConexionesDesdeEntorno();
  return api ? faltantesHandler(req, (await params).id, api) : Response.json({ error: "backend_sin_configurar" }, { status: 503 });
}
