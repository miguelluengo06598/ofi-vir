import { asistenteHandler, depsAsistenteDesdeEntorno } from "@/lib/agentes/asistente/api";

/** Ver src/lib/agentes/asistente/api.ts: la empresa sale de la sesión; devuelve una propuesta y no guarda nada. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const api = depsAsistenteDesdeEntorno();
  if (!api) return Response.json({ error: "backend_sin_configurar" }, { status: 503 });
  return asistenteHandler(req, (await params).id, api);
}
