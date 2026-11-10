/** Tarea periódica: renovar antes de que caduquen los tokens de las conexiones (el uso normal también renueva; esto cubre las que no se usan). */
import type { SupabaseClient } from "@supabase/supabase-js";
import { renovarSiHaceFalta, type DepsConexiones } from "./servicio.ts";

export const ANTICIPACION_RENOVACION_MS = 15 * 60 * 1000;

export async function renovarConexionesPorCaducar(d: DepsConexiones & { db: SupabaseClient }, empresaId?: string) {
  const limite = new Date(d.ahora().getTime() + ANTICIPACION_RENOVACION_MS).toISOString();
  let q = d.db.from("company_connections").select("id, company_id, proveedor, estado, caduca_en, cuenta_externa, scopes, tipo_auth").eq("estado", "conectado").eq("tipo_auth", "oauth2").not("caduca_en", "is", null).lt("caduca_en", limite);
  if (empresaId) q = q.eq("company_id", empresaId);
  const { data, error } = await q.limit(500);
  if (error) throw new Error("renovar-conexiones: no se pudieron leer las conexiones.");
  const r = { revisadas: 0, renovadas: 0, caducadas: 0, pendientes: 0, otras: 0 };
  for (const c of data ?? []) {
    r.revisadas++;
    const res = await renovarSiHaceFalta(d, c.company_id as string, c as never, c.proveedor as string, true);
    if (res === "renovada") r.renovadas++; else if (res === "caducada") r.caducadas++; else if (res === "pendiente") r.pendientes++; else r.otras++;
  }
  d.log.info(`[cron] renovar-conexiones: ${r.revisadas} revisadas, ${r.renovadas} renovadas, ${r.caducadas} caducadas, ${r.pendientes} pendientes.`);
  return r;
}
