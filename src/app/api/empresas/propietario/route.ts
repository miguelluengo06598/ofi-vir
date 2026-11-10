import { propietarioPostHandler } from "@/lib/empresas/api";
import { depsEmpresasDesdeEntorno } from "@/lib/empresas/entorno";

/** Transferir la propiedad ({ userId }): solo el propietario. */
export async function POST(req: Request) {
  const deps = depsEmpresasDesdeEntorno();
  if (!deps) return Response.json({ error: "backend_sin_configurar" }, { status: 503 });
  return propietarioPostHandler(req, deps);
}
