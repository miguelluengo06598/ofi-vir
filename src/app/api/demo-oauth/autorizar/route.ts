import { demoActivo, emitirCodigo, validarSolicitud } from "@/lib/integraciones/demoOauth";

/**
 * Proveedor DEMO: la persona pulsó «Autorizar» o «Cancelar» en la pantalla falsa. Se vuelve a validar todo (el formulario lo puede manipular
 * cualquiera) y solo se redirige al `redirect_uri` exacto de esta aplicación.
 */
export async function POST(req: Request) {
  if (!demoActivo()) return new Response(null, { status: 404 });
  const f = await req.formData();
  const campo = (k: string) => (typeof f.get(k) === "string" ? (f.get(k) as string) : undefined);
  const q = { client_id: campo("client_id"), redirect_uri: campo("redirect_uri"), response_type: "code", state: campo("state"), code_challenge: campo("code_challenge"), code_challenge_method: campo("code_challenge_method") };
  const problema = validarSolicitud(q);
  if (problema) return Response.json({ error: "invalid_request", mensaje: problema }, { status: 400 });
  const destino = new URL(q.redirect_uri!);
  destino.searchParams.set("state", q.state!);
  if (campo("decision") === "autorizar") destino.searchParams.set("code", emitirCodigo({ redirect_uri: q.redirect_uri!, code_challenge: q.code_challenge, scope: campo("scope") }, process.env));
  else destino.searchParams.set("error", "access_denied");
  return new Response(null, { status: 303, headers: { location: destino.href, "cache-control": "no-store" } });
}
