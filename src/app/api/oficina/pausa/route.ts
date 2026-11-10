import { after } from "next/server";
import { motorDesdeEntorno } from "@/lib/agents/fromEnv";
import { procesarTareasPendientes } from "@/lib/agentes/traspasos/procesar";
import { pausaGetHandler, pausaPostHandler } from "@/lib/oficina/api";
import { depsOficinaDesdeEntorno } from "@/lib/oficina/entorno";

/** Pausar / reanudar la oficina. La empresa sale de la sesión (ver src/lib/oficina/api.ts). */
export async function GET(req: Request) {
  const deps = depsOficinaDesdeEntorno();
  if (!deps) return Response.json({ error: "backend_sin_configurar" }, { status: 503 });
  return pausaGetHandler(req, deps);
}

export async function POST(req: Request) {
  const deps = depsOficinaDesdeEntorno();
  if (!deps) return Response.json({ error: "backend_sin_configurar" }, { status: 503 });
  const res = await pausaPostHandler(req, deps);
  // Al reanudar, lo que esperaba se procesa (si la empresa no eligió descartarlo, ya está fuera de la cola).
  if (res.ok) {
    const cuerpo = (await res.clone().json()) as { pausada?: boolean };
    const motor = cuerpo.pausada === false ? motorDesdeEntorno() : null;
    if (motor) after(() => procesarTareasPendientes(motor.deps, { maxTareas: 20 }).then(() => undefined).catch((e) => console.error("cola al reanudar:", e instanceof Error ? e.message : e)));
  }
  return res;
}
