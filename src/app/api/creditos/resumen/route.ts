import { resumenHandler } from "@/lib/creditos/api";
import { depsApiDesdeEntorno } from "@/lib/creditos/apiEntorno";

/** Ver src/lib/creditos/api.ts: la empresa sale de la sesión, nunca de la petición. */
export async function GET(req: Request) {
  const deps = depsApiDesdeEntorno();
  if (!deps) return Response.json({ error: "backend_sin_configurar" }, { status: 503 });
  return resumenHandler(req, deps);
}
