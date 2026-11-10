import { NextResponse, type NextRequest } from "next/server";
import { sesionAdminIdesie } from "@/lib/admin/acceso";
import { sesionRevisor } from "@/lib/admin/certificacion/acceso";
import { dbAdminDesdeEntorno } from "@/lib/admin/entorno";

/**
 * /admin/* es interno: quien no tiene el rol que toca recibe un 404 real (cada página lo vuelve a comprobar).
 *  - /admin/certificacion/*: equipo revisor (`revisor_samgple` o `admin_samgple` en `reviewers`).
 *  - el resto de /admin/*: `admin_idesie`.
 */
export async function proxy(req: NextRequest) {
  const db = dbAdminDesdeEntorno();
  if (db) {
    const ruta = req.nextUrl.pathname;
    const esCertificacion = ruta === "/admin/certificacion" || ruta.startsWith("/admin/certificacion/");
    if (esCertificacion ? await sesionRevisor(req.headers, db) : await sesionAdminIdesie(req.headers, db)) return NextResponse.next();
  }
  return new NextResponse("No encontrado", { status: 404, headers: { "cache-control": "no-store" } });
}

export const config = { matcher: ["/admin/:path*"] };
