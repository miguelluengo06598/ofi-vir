import { sesionAdminIdesie } from "@/lib/admin/acceso";
import { dbAdminDesdeEntorno } from "@/lib/admin/entorno";
import { mesActual, obtenerMargenes, primerDiaDelMes } from "@/lib/admin/margenes";

const noEncontrado = () => Response.json({ error: "no_encontrado" }, { status: 404, headers: { "cache-control": "no-store" } });

/** Solo `admin_idesie`. Cualquier otra persona (o sin sesión) recibe 404. */
export async function GET(req: Request) {
  const db = dbAdminDesdeEntorno();
  if (!db) return Response.json({ error: "backend_sin_configurar" }, { status: 503 });
  if (!(await sesionAdminIdesie(req.headers, db))) return noEncontrado();
  const mes = new URL(req.url).searchParams.get("mes") ?? mesActual();
  if (!primerDiaDelMes(mes)) return Response.json({ error: "mes_invalido", mensaje: "Usa el formato AAAA-MM." }, { status: 400 });
  try {
    return Response.json(await obtenerMargenes(db, mes), { headers: { "cache-control": "no-store" } });
  } catch (e) {
    console.error("[api/admin/margenes]", e instanceof Error ? e.message : e);
    return Response.json({ error: "error_interno" }, { status: 500 });
  }
}
