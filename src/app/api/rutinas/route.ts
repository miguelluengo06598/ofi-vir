import { rutinasGetHandler, rutinasPostHandler } from "@/lib/oficina/api";
import { depsOficinaDesdeEntorno } from "@/lib/oficina/entorno";

/** Rutinas de la empresa y rutinas sugeridas por las plantillas. Crear: siempre desactivada (ver src/lib/oficina/api.ts). */
export async function GET(req: Request) {
  const deps = depsOficinaDesdeEntorno();
  if (!deps) return Response.json({ error: "backend_sin_configurar" }, { status: 503 });
  return rutinasGetHandler(req, deps);
}

export async function POST(req: Request) {
  const deps = depsOficinaDesdeEntorno();
  if (!deps) return Response.json({ error: "backend_sin_configurar" }, { status: 503 });
  return rutinasPostHandler(req, deps);
}
