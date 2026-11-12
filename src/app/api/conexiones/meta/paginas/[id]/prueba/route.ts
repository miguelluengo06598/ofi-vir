import { depsConexionesDesdeEntorno } from "@/lib/integraciones/api";
import { abrirPruebaHandler, leadsDePruebaHandler } from "@/lib/integraciones/meta/api";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const api = depsConexionesDesdeEntorno();
  return api ? abrirPruebaHandler(req, (await params).id, api) : Response.json({ error: "backend_sin_configurar" }, { status: 503 });
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const api = depsConexionesDesdeEntorno();
  return api ? leadsDePruebaHandler(req, (await params).id, api) : Response.json({ error: "backend_sin_configurar" }, { status: 503 });
}
