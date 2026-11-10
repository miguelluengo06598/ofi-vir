import { seguimientosGetHandler } from "@/lib/oficina/api";
import { depsOficinaDesdeEntorno } from "@/lib/oficina/entorno";

/** Seguimientos que proponen los agentes (ver src/lib/oficina/api.ts). */
export async function GET(req: Request) {
  const deps = depsOficinaDesdeEntorno();
  if (!deps) return Response.json({ error: "backend_sin_configurar" }, { status: 503 });
  return seguimientosGetHandler(req, deps);
}
