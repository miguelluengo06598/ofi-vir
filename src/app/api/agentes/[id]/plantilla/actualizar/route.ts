import { after } from "next/server";
import { actualizarPlantillaHandler, depsCicloDesdeEntorno } from "@/lib/agentes/versiones/api";

/** Actualiza el agente a la versión nueva de su plantilla (versión nueva del agente, por la vía rápida de certificación). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const api = depsCicloDesdeEntorno((p) => after(() => p));
  if (!api) return Response.json({ error: "backend_sin_configurar" }, { status: 503 });
  return actualizarPlantillaHandler(req, (await params).id, api);
}
