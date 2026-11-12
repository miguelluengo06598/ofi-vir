import { after } from "next/server";
import { dbAdminDesdeEntorno } from "@/lib/admin/entorno";
import { depsLeadsDesdeEntorno, procesarLeadsMeta } from "@/lib/integraciones/meta/leads";
import { recibirAvisos, verificarSuscripcion } from "@/lib/integraciones/meta/webhook";

/** Meta comprueba que esta dirección es nuestra (Panel de apps → Webhooks). */
export function GET(req: Request) {
  return verificarSuscripcion(new URL(req.url), process.env);
}

/**
 * Avisos de leads nuevos. La firma se verifica sobre el cuerpo en bruto antes de leer nada; se guardan solo los ids y se
 * responde enseguida. El lead se procesa DESPUÉS de responder (`after`) y, si eso falla, lo recoge el cron `leads-meta`.
 */
export async function POST(req: Request) {
  const db = dbAdminDesdeEntorno();
  if (!db) return Response.json({ estado: "backend_sin_configurar" }, { status: 503 });
  const respuesta = await recibirAvisos({ db, env: process.env, log: console }, await req.text(), req.headers);
  if (respuesta.status === 200) {
    after(async () => {
      try {
        const deps = await depsLeadsDesdeEntorno();
        if (deps) await procesarLeadsMeta(deps);
      } catch (e) {
        console.error("[meta] el procesado tras el aviso falló; lo recogerá el cron leads-meta:", e instanceof Error ? e.name : "error");
      }
    });
  }
  return respuesta;
}
