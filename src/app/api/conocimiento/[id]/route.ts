import { after } from "next/server";
import { borrarHandler, depsConocimientoDesdeEntorno } from "@/lib/conocimiento/api";

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = depsConocimientoDesdeEntorno((trabajo) => after(trabajo));
  if (!a) return Response.json({ error: "backend_sin_configurar" }, { status: 503 });
  return borrarHandler(req, (await params).id, a);
}
