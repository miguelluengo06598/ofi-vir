import { ejecutarTarea } from "@/lib/agents/loop";
import { motorDesdeEntorno } from "@/lib/agents/fromEnv";
import { mensajesGetHandler, mensajesPostHandler, type DepsChat } from "@/lib/oficina/chat";
import { depsOficinaDesdeEntorno } from "@/lib/oficina/entorno";

// El agente puede usar varias herramientas antes de contestar (máximo 8 pasos).
export const maxDuration = 300;

function deps(): DepsChat | null {
  const base = depsOficinaDesdeEntorno();
  return base ? { ...base, motor: motorDesdeEntorno, ejecutar: ejecutarTarea } : null;
}

/** Conversaciones de la persona de la sesión con sus agentes. */
export async function GET(req: Request) {
  const d = deps();
  if (!d) return Response.json({ error: "backend_sin_configurar" }, { status: 503 });
  return mensajesGetHandler(req, d);
}

/** Escribir a un agente: crea y ejecuta una tarea real («Orden de …»). */
export async function POST(req: Request) {
  const d = deps();
  if (!d) return Response.json({ error: "backend_sin_configurar" }, { status: 503 });
  return mensajesPostHandler(req, d);
}
