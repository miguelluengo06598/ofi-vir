import { cambiosPropietarioGetHandler } from "@/lib/admin/clientes/empresa";
import { depsEmpresasDesdeEntorno } from "@/lib/empresas/entorno";

/** Cambio de propietario pendiente pedido por SAMGPLE (propietario o admin). */
export async function GET(req: Request) {
  const deps = depsEmpresasDesdeEntorno();
  if (!deps) return Response.json({ error: "backend_sin_configurar" }, { status: 503 });
  return cambiosPropietarioGetHandler(req, deps);
}
