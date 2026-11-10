import { aceptarInvitacionHandler } from "@/lib/empresas/api";
import { depsEmpresasDesdeEntorno } from "@/lib/empresas/entorno";

/** Aceptar una invitación ({ token }) con la sesión de la persona invitada. */
export async function POST(req: Request) {
  const deps = depsEmpresasDesdeEntorno();
  if (!deps) return Response.json({ error: "backend_sin_configurar" }, { status: 503 });
  return aceptarInvitacionHandler(req, deps);
}
