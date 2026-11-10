import { after } from "next/server";
import { depsCicloDesdeEntorno, retirarCorreccionHandler } from "@/lib/agentes/versiones/api";

/** Retira una corrección (crea una versión nueva del agente). */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string; correccionId: string }> }) {
  const api = depsCicloDesdeEntorno((p) => after(() => p));
  if (!api) return Response.json({ error: "backend_sin_configurar" }, { status: 503 });
  const { id, correccionId } = await params;
  return retirarCorreccionHandler(req, id, correccionId, api);
}
