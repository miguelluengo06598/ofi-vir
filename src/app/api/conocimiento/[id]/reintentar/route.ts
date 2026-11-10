import { after } from "next/server";
import { depsConocimientoDesdeEntorno, reintentarHandler } from "@/lib/conocimiento/api";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = depsConocimientoDesdeEntorno((trabajo) => after(trabajo));
  if (!a) return Response.json({ error: "backend_sin_configurar" }, { status: 503 });
  return reintentarHandler(req, (await params).id, a);
}
