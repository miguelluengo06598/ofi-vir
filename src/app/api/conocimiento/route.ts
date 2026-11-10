import { after } from "next/server";
import { crearHandler, depsConocimientoDesdeEntorno, listarHandler } from "@/lib/conocimiento/api";

/** Ver src/lib/conocimiento/api.ts: la empresa sale de la sesión; el procesado sigue en segundo plano (`after`). */
const api = () => depsConocimientoDesdeEntorno((trabajo) => after(trabajo));
const sinBackend = () => Response.json({ error: "backend_sin_configurar" }, { status: 503 });

export async function POST(req: Request) {
  const a = api();
  return a ? crearHandler(req, a) : sinBackend();
}
export async function GET(req: Request) {
  const a = api();
  return a ? listarHandler(req, a) : sinBackend();
}
