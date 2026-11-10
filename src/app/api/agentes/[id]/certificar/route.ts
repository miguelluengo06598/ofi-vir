import { after } from "next/server";
import { certificarHandler, depsApiCertificacionDesdeEntorno } from "@/lib/certificacion/api";

/** Ver src/lib/certificacion/api.ts: envía el agente a certificación y lanza el examen técnico en segundo plano. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const api = depsApiCertificacionDesdeEntorno();
  if (!api) return Response.json({ error: "certificacion_sin_configurar", mensaje: "Falta la configuración de la base de datos." }, { status: 503 });
  return certificarHandler(req, (await params).id, { ...api, enSegundoPlano: (p) => after(() => p) });
}
