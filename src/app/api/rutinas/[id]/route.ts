import { rutinaDeleteHandler, rutinaPostHandler } from "@/lib/oficina/api";
import { depsOficinaDesdeEntorno } from "@/lib/oficina/entorno";

/** Activar ({ accion: "activar", costeConfirmado }) o desactivar una rutina. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const deps = depsOficinaDesdeEntorno();
  if (!deps) return Response.json({ error: "backend_sin_configurar" }, { status: 503 });
  return rutinaPostHandler(req, (await params).id, deps);
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const deps = depsOficinaDesdeEntorno();
  if (!deps) return Response.json({ error: "backend_sin_configurar" }, { status: 503 });
  return rutinaDeleteHandler(req, (await params).id, deps);
}
