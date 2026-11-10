import { empresaActivaPostHandler } from "@/lib/empresas/api";
import { depsEmpresasDesdeEntorno } from "@/lib/empresas/entorno";

/** Elegir la empresa activa ({ companyId }): solo si soy miembro activo. Guarda la cookie empresa_activa. */
export async function POST(req: Request) {
  const deps = depsEmpresasDesdeEntorno();
  if (!deps) return Response.json({ error: "backend_sin_configurar" }, { status: 503 });
  return empresaActivaPostHandler(req, deps);
}
