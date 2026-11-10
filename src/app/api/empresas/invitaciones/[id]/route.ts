import { invitacionDeleteHandler } from "@/lib/empresas/api";
import { depsEmpresasDesdeEntorno } from "@/lib/empresas/entorno";

/** Revocar una invitación pendiente. */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const deps = depsEmpresasDesdeEntorno();
  if (!deps) return Response.json({ error: "backend_sin_configurar" }, { status: 503 });
  return invitacionDeleteHandler(req, (await params).id, deps);
}
