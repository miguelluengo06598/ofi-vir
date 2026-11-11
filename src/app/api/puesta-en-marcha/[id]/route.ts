import { puestaPostHandler } from "@/lib/admin/implantacion/cliente";
import { depsEmpresasDesdeEntorno } from "@/lib/empresas/entorno";

/** Marcar como hecha una tarea manual del cliente ({ hecha: true }). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const deps = depsEmpresasDesdeEntorno();
  if (!deps) return Response.json({ error: "backend_sin_configurar" }, { status: 503 });
  return puestaPostHandler(req, deps, (await params).id);
}
