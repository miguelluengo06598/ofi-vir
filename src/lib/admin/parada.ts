/**
 * Parada de emergencia global (SOLO SERVIDOR). La activa o desactiva un `admin_samgple` del equipo de SAMGPLE: detiene al momento
 * todos los agentes de todas las empresas (las tareas en curso se paran antes de su siguiente llamada al modelo; las de la cola
 * esperan). La lee la puerta de ejecución (`puedeEjecutarse`) antes de cada llamada a Claude. Cualquier otra persona recibe 404.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { sesionRevisor } from "./certificacion/acceso.ts";
import { ipDe, registrarAuditoria } from "./acceso.ts";

const json = (cuerpo: unknown, status = 200) => Response.json(cuerpo, { status, headers: { "cache-control": "no-store" } });
const noExiste = () => json({ error: "no_encontrado" }, 404);

export type EstadoParada = { activa: boolean; motivo: string | null; cambiadoEn: string | null; cambiadoPor: string | null };

export async function leerParada(db: SupabaseClient): Promise<EstadoParada> {
  const { data, error } = await db.from("plataforma_control").select("parada_emergencia, motivo, cambiado_en, cambiado_por, users(full_name)").eq("id", true).single();
  if (error) throw new Error("No se pudo leer la parada de emergencia.");
  return { activa: data.parada_emergencia, motivo: data.motivo, cambiadoEn: data.cambiado_en, cambiadoPor: (data.users as { full_name?: string } | null)?.full_name ?? null };
}

const CambioSchema = z.union([
  z.object({ activar: z.literal(true), motivo: z.string().trim().min(3).max(300) }).strict(),
  z.object({ activar: z.literal(false) }).strict(),
]);

export async function paradaGetHandler(req: Request, db: SupabaseClient, env: Record<string, string | undefined> = process.env): Promise<Response> {
  const s = await sesionRevisor(req.headers, db, env);
  if (!s) return noExiste();
  return json({ ...(await leerParada(db)), puedeCambiar: s.rol === "admin_samgple" });
}

export async function paradaPostHandler(req: Request, db: SupabaseClient, env: Record<string, string | undefined> = process.env): Promise<Response> {
  const s = await sesionRevisor(req.headers, db, env);
  if (!s || s.rol !== "admin_samgple") return noExiste();
  let datos: unknown;
  try { datos = JSON.parse((await req.text()) || "{}"); } catch { return json({ error: "json_invalido" }, 400); }
  const v = CambioSchema.safeParse(datos);
  if (!v.success) return json({ error: "peticion_invalida", mensaje: "Indica activar (true/false) y, al activarla, un motivo." }, 400);
  const antes = await leerParada(db);
  const { error } = await db.from("plataforma_control").update({
    parada_emergencia: v.data.activar, motivo: v.data.activar ? v.data.motivo : null, cambiado_por: s.userId, cambiado_en: new Date().toISOString(),
  }).eq("id", true);
  if (error) return json({ error: "error_interno" }, 500);
  await registrarAuditoria(db, { actorId: s.userId, ip: ipDe(req.headers), accion: v.data.activar ? "plataforma.parada_activar" : "plataforma.parada_desactivar", objetoTipo: "plataforma_control", objetoId: "global", antes, despues: { activa: v.data.activar, motivo: v.data.activar ? v.data.motivo : null }, motivo: v.data.activar ? v.data.motivo : antes.motivo });
  console.warn(`[parada-emergencia] ${v.data.activar ? "ACTIVADA" : "desactivada"} por ${s.userId}`);
  return json(await leerParada(db));
}
