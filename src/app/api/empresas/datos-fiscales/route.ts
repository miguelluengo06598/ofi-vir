import { fiscalesGetHandler, fiscalesPostHandler } from "@/lib/admin/implantacion/cliente";
import { depsEmpresasDesdeEntorno } from "@/lib/empresas/entorno";

/** Datos fiscales de la empresa activa (propietario o admin). */
export async function GET(req: Request) {
  const deps = depsEmpresasDesdeEntorno();
  if (!deps) return Response.json({ error: "backend_sin_configurar" }, { status: 503 });
  return fiscalesGetHandler(req, deps);
}
export async function POST(req: Request) {
  const deps = depsEmpresasDesdeEntorno();
  if (!deps) return Response.json({ error: "backend_sin_configurar" }, { status: 503 });
  return fiscalesPostHandler(req, deps);
}
