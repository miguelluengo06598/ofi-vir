import { depsConexionesDesdeEntorno } from "@/lib/integraciones/api";
import { paginaHandler } from "@/lib/integraciones/meta/api";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const api = depsConexionesDesdeEntorno();
  return api ? paginaHandler(req, (await params).id, api) : Response.json({ error: "backend_sin_configurar" }, { status: 503 });
}
