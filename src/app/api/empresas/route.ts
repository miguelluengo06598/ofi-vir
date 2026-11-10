import { empresasGetHandler } from "@/lib/empresas/api";
import { depsEmpresasDesdeEntorno } from "@/lib/empresas/entorno";

/** Mis empresas y cuál está activa. */
export async function GET(req: Request) {
  const deps = depsEmpresasDesdeEntorno();
  if (!deps) return Response.json({ error: "backend_sin_configurar" }, { status: 503 });
  return empresasGetHandler(req, deps);
}
