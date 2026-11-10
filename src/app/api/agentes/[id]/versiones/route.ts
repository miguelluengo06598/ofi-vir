import { after } from "next/server";
import { depsCicloDesdeEntorno, guardarVersionHandler, versionesHandler } from "@/lib/agentes/versiones/api";

/** Historial de versiones del agente, con las diferencias entre ellas y cuáles fueron certificadas. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const api = depsCicloDesdeEntorno();
  if (!api) return Response.json({ error: "backend_sin_configurar" }, { status: 503 });
  return versionesHandler(req, (await params).id, api);
}

/** Guarda cambios como versión nueva. Si el agente ya trabaja, se envía a certificación sin interrumpirlo. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const api = depsCicloDesdeEntorno((p) => after(() => p));
  if (!api) return Response.json({ error: "backend_sin_configurar" }, { status: 503 });
  return guardarVersionHandler(req, (await params).id, api);
}
