import { miembroPostHandler } from "@/lib/empresas/api";
import { depsEmpresasDesdeEntorno } from "@/lib/empresas/entorno";

/** Cambiar rol, estado o permiso de aprobar de un miembro (propietario o admin). */
export async function POST(req: Request, { params }: { params: Promise<{ userId: string }> }) {
  const deps = depsEmpresasDesdeEntorno();
  if (!deps) return Response.json({ error: "backend_sin_configurar" }, { status: 503 });
  return miembroPostHandler(req, (await params).userId, deps);
}
