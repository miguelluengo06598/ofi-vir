import { miembrosGetHandler } from "@/lib/empresas/api";
import { depsEmpresasDesdeEntorno } from "@/lib/empresas/entorno";

/** Miembros de la empresa activa. */
export async function GET(req: Request) {
  const deps = depsEmpresasDesdeEntorno();
  if (!deps) return Response.json({ error: "backend_sin_configurar" }, { status: 503 });
  return miembrosGetHandler(req, deps);
}
