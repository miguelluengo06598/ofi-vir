import { dbAdminDesdeEntorno } from "@/lib/admin/entorno";
import { avisoDeFacebook } from "@/lib/integraciones/meta/mantenimiento";

/** Facebook pide borrar los datos de una persona (Panel de apps → Facebook Login → «URL de solicitud de eliminación de datos»). */
export async function POST(req: Request) {
  const db = dbAdminDesdeEntorno();
  if (!db) return Response.json({ error: "backend_sin_configurar" }, { status: 503 });
  return avisoDeFacebook({ db, env: process.env, log: console }, "eliminar", req);
}
