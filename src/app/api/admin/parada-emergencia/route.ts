import { paradaGetHandler, paradaPostHandler } from "@/lib/admin/parada";
import { dbAdminDesdeEntorno } from "@/lib/admin/entorno";

/** Parada de emergencia global de MyOfia (solo admin_samgple; el resto recibe 404). */
export async function GET(req: Request) {
  const db = dbAdminDesdeEntorno();
  if (!db) return Response.json({ error: "no_encontrado" }, { status: 404 });
  return paradaGetHandler(req, db);
}

export async function POST(req: Request) {
  const db = dbAdminDesdeEntorno();
  if (!db) return Response.json({ error: "no_encontrado" }, { status: 404 });
  return paradaPostHandler(req, db);
}
