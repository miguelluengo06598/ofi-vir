import { cuentaDelToken, demoActivo } from "@/lib/integraciones/demoOauth";

/** «API» de la aplicación demo: la cuenta del token. */
export async function GET(req: Request) {
  if (!demoActivo()) return new Response(null, { status: 404 });
  const c = cuentaDelToken(req.headers.get("authorization"));
  return c ? Response.json(c, { headers: { "cache-control": "no-store" } }) : Response.json({ error: "invalid_token" }, { status: 401 });
}
