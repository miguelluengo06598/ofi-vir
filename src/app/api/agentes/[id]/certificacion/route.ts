import { depsApiCertificacionDesdeEntorno, informeHandler } from "@/lib/certificacion/api";

/** Ver src/lib/certificacion/api.ts: estado de la última solicitud de certificación y el informe del examen. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const api = depsApiCertificacionDesdeEntorno();
  if (!api) return Response.json({ error: "certificacion_sin_configurar", mensaje: "Falta la configuración de la base de datos." }, { status: 503 });
  return informeHandler(req, (await params).id, api);
}
