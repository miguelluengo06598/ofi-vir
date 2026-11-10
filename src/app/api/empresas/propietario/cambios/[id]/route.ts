import { cambioPropietarioPostHandler } from "@/lib/admin/clientes/empresa";
import { depsEmpresasDesdeEntorno } from "@/lib/empresas/entorno";

/** El propietario actual confirma o rechaza el cambio ({ decision: 'confirmar' | 'rechazar' }). */
export async function POST(req: Request, ctx: RouteContext<"/api/empresas/propietario/cambios/[id]">) {
  const deps = depsEmpresasDesdeEntorno();
  if (!deps) return Response.json({ error: "backend_sin_configurar" }, { status: 503 });
  return cambioPropietarioPostHandler(req, deps, (await ctx.params).id);
}
