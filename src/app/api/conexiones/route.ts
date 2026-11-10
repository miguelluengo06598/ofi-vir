import { depsConexionesDesdeEntorno, listarHandler } from "@/lib/integraciones/api";

export async function GET(req: Request) {
  const api = depsConexionesDesdeEntorno();
  return api ? listarHandler(req, api) : Response.json({ error: "backend_sin_configurar" }, { status: 503 });
}
