import { after } from "next/server";
import { depsCicloDesdeEntorno, restaurarHandler } from "@/lib/agentes/versiones/api";

/** «Volver a esta versión»: crea una versión nueva igual a la indicada. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string; version: string }> }) {
  const api = depsCicloDesdeEntorno((p) => after(() => p));
  if (!api) return Response.json({ error: "backend_sin_configurar" }, { status: 503 });
  const { id, version } = await params;
  return restaurarHandler(req, id, version, api);
}
