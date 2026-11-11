import { puestaGetHandler } from "@/lib/admin/implantacion/cliente";
import { depsEmpresasDesdeEntorno } from "@/lib/empresas/entorno";

/** Progreso y tareas de la puesta en marcha de la empresa activa. */
export async function GET(req: Request) {
  const deps = depsEmpresasDesdeEntorno();
  if (!deps) return Response.json({ error: "backend_sin_configurar" }, { status: 503 });
  return puestaGetHandler(req, deps);
}
