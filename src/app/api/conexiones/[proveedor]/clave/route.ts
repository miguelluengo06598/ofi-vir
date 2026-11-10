import { claveHandler, depsConexionesDesdeEntorno } from "@/lib/integraciones/api";

export async function POST(req: Request, { params }: { params: Promise<{ proveedor: string }> }) {
  const api = depsConexionesDesdeEntorno();
  return api ? claveHandler(req, (await params).proveedor, api) : Response.json({ error: "backend_sin_configurar" }, { status: 503 });
}
