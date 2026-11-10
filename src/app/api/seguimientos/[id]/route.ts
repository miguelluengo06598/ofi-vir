import { seguimientoPostHandler } from "@/lib/oficina/api";
import { depsOficinaDesdeEntorno } from "@/lib/oficina/entorno";

/** Aprobar o rechazar un seguimiento: { decision: "aprobar" | "rechazar" }. Solo propietarios y administradores. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const deps = depsOficinaDesdeEntorno();
  if (!deps) return Response.json({ error: "backend_sin_configurar" }, { status: 503 });
  return seguimientoPostHandler(req, (await params).id, deps);
}
