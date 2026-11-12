import { dbAdminDesdeEntorno } from "@/lib/admin/entorno";
import { avisoDeFacebook } from "@/lib/integraciones/meta/mantenimiento";

/** Facebook avisa de que una persona ha quitado la app (Panel de apps → Facebook Login → «URL de devolución de llamada de desautorización»). */
export async function POST(req: Request) {
  const db = dbAdminDesdeEntorno();
  if (!db) return Response.json({ error: "backend_sin_configurar" }, { status: 503 });
  return avisoDeFacebook({ db, env: process.env, log: console }, "desautorizar", req);
}
