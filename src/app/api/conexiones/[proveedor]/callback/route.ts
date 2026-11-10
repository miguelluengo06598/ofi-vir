import { callbackHandler, depsConexionesDesdeEntorno } from "@/lib/integraciones/api";

export async function GET(req: Request, { params }: { params: Promise<{ proveedor: string }> }) {
  const api = depsConexionesDesdeEntorno();
  return api ? callbackHandler(req, (await params).proveedor, api) : Response.json({ error: "backend_sin_configurar" }, { status: 503 });
}
