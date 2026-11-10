import { tareasGetHandler } from "@/lib/oficina/api";
import { depsOficinaDesdeEntorno } from "@/lib/oficina/entorno";

/** Últimas tareas reales con por qué empezaron y su cadena desde el origen. */
export async function GET(req: Request) {
  const deps = depsOficinaDesdeEntorno();
  if (!deps) return Response.json({ error: "backend_sin_configurar" }, { status: 503 });
  return tareasGetHandler(req, deps);
}
