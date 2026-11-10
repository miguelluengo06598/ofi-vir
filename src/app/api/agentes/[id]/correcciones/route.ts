import { after } from "next/server";
import { correccionesHandler, depsCicloDesdeEntorno, guardarCorreccionHandler } from "@/lib/agentes/versiones/api";

/** Correcciones activas y pendientes del agente. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const api = depsCicloDesdeEntorno();
  if (!api) return Response.json({ error: "backend_sin_configurar" }, { status: 503 });
  return correccionesHandler(req, (await params).id, api);
}

/** «Recordar para la próxima»: guarda la regla (pasa el examen técnico antes de entrar en las instrucciones de un agente que trabaja). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const api = depsCicloDesdeEntorno((p) => after(() => p));
  if (!api) return Response.json({ error: "backend_sin_configurar" }, { status: 503 });
  return guardarCorreccionHandler(req, (await params).id, api);
}
