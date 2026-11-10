import { canjear, demoActivo } from "@/lib/integraciones/demoOauth";

/** Proveedor DEMO (solo local): endpoint de token. 404 si la demo no está activada. */
export async function POST(req: Request) {
  if (!demoActivo()) return new Response(null, { status: 404 });
  const r = canjear(new URLSearchParams(await req.text()));
  return Response.json(r.cuerpo, { status: r.status, headers: { "cache-control": "no-store" } });
}
