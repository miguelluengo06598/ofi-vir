import { exportacionesGetHandler } from "@/lib/admin/clientes/empresa";
import { depsEmpresasDesdeEntorno } from "@/lib/empresas/entorno";

/** Exportaciones de datos de la empresa activa (propietario o admin). */
export async function GET(req: Request) {
  const deps = depsEmpresasDesdeEntorno();
  if (!deps) return Response.json({ error: "backend_sin_configurar" }, { status: 503 });
  return exportacionesGetHandler(req, deps);
}
