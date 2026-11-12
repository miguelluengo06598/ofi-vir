import { depsConexionesDesdeEntorno } from "@/lib/integraciones/api";
import { estadoHandler } from "@/lib/integraciones/meta/api";

export async function GET(req: Request) {
  const api = depsConexionesDesdeEntorno();
  return api ? estadoHandler(req, api) : Response.json({ error: "backend_sin_configurar" }, { status: 503 });
}
