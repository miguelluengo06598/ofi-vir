import { depsConexionesDesdeEntorno, desconectarHandler } from "@/lib/integraciones/api";

/** El segmento se llama [proveedor] porque Next no admite dos nombres en la misma posición; aquí vale el id de la conexión. */
export async function POST(req: Request, { params }: { params: Promise<{ proveedor: string }> }) {
  const api = depsConexionesDesdeEntorno();
  return api ? desconectarHandler(req, (await params).proveedor, api) : Response.json({ error: "backend_sin_configurar" }, { status: 503 });
}
