import { exportacionDescargaHandler } from "@/lib/admin/clientes/empresa";
import { depsEmpresasDesdeEntorno } from "@/lib/empresas/entorno";

/** Descarga de una exportación (propietario o admin de la empresa activa): redirige a un enlace firmado de 5 min. */
export async function GET(req: Request, ctx: RouteContext<"/api/empresas/exportaciones/[id]">) {
  const deps = depsEmpresasDesdeEntorno();
  if (!deps) return Response.json({ error: "backend_sin_configurar" }, { status: 503 });
  return exportacionDescargaHandler(req, deps, (await ctx.params).id);
}
