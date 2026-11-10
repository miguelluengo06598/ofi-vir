import { demoActivo, revocar } from "@/lib/integraciones/demoOauth";

export async function POST(req: Request) {
  if (!demoActivo()) return new Response(null, { status: 404 });
  revocar(new URLSearchParams(await req.text()));
  return new Response(null, { status: 200 });
}
