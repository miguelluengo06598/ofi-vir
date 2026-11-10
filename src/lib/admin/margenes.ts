/**
 * Datos del panel interno de márgenes. SOLO SERVIDOR. Los agregados salen de la función SQL `admin_margenes` (clave de servicio);
 * aquí se convierten los dólares a euros con CAMBIO_USD_POR_EUR y se calculan márgenes. Dinero en céntimos enteros.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { UMBRAL_ALERTA_MARGEN, valorCreditoUsdMicros } from "../creditos/tarifas.ts";

const N = z.coerce.number();
const RFila = z.object({
  por_empresa_mes: z.array(z.object({ company_id: z.string(), empresa: z.string(), mes: z.string(), cobrado_centimos: N, creditos_consumidos: N, coste_ia_usd_micros: N })),
  por_agente: z.array(z.object({ company_id: z.string(), empresa: z.string(), agent_id: z.string().nullable(), agente: z.string(), tareas: N, creditos_cobrados: N, coste_ia_usd_micros: N, alertas_margen: N })),
  por_tipo: z.array(z.object({ tipo: z.string(), tareas: N, coste_ia_usd_micros: N, creditos_cobrados: N })),
  saldo_vivo: z.object({ creditos: N, empresas: N }),
  caducados_mes: N,
  alertas: z.array(z.object({ id: z.string(), tipo: z.enum(["margen_superado", "limite_pasos", "recarga_fallida"]), empresa: z.string(), agente: z.string().nullable(), detalle: z.record(z.string(), z.unknown()), creadoEn: z.string() })),
});

/** Margen en %, o null si no se cobró nada (sin base para calcularlo). */
export const margenPct = (cobrado: number, coste: number): number | null => (cobrado > 0 ? ((cobrado - coste) / cobrado) * 100 : null);

export type FilaEmpresaMes = { empresaId: string; empresa: string; mes: string; cobradoCentimos: number; creditosConsumidos: number; costeIaCentimos: number; margenCentimos: number; margenPct: number | null };
export type FilaAgente = { empresa: string; agente: string; tareas: number; creditosCobrados: number; costeIaCentimos: number; margenPct: number | null; alertasMargen: number };
export type FilaTipo = { tipo: string; tareas: number; costeMedioCentimos: number; cobradoMedioCentimos: number; margenPct: number | null };

export type DatosMargenes = {
  mes: string;
  /** Tipo de cambio usado (USD por EUR). */
  cambioUsdPorEur: number;
  porEmpresaMes: FilaEmpresaMes[];
  porAgente: FilaAgente[];
  porTipo: FilaTipo[];
  saldoVivo: { creditos: number; euros: number; empresas: number };
  caducadosMes: number;
  alertas: { id: string; tipo: string; empresa: string; agente: string | null; detalle: Record<string, unknown>; creadoEn: string }[];
  umbralMargen: number;
};

/** «2026-11» → «2026-11-01»; null si no es un mes válido. */
export function primerDiaDelMes(mes: string): string | null {
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(mes);
  return m ? `${m[1]}-${m[2]}-01` : null;
}
export const mesActual = (ahora: Date = new Date()): string =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit" }).format(ahora).slice(0, 7);

export async function obtenerMargenes(db: SupabaseClient, mes: string, env: Record<string, string | undefined> = process.env): Promise<DatosMargenes> {
  const dia = primerDiaDelMes(mes);
  if (!dia) throw new Error(`Mes no válido: «${mes}» (usa AAAA-MM).`);
  const { data, error } = await db.rpc("admin_margenes", { p_mes: dia });
  if (error) throw new Error(`No se pudieron leer los márgenes: ${error.message}`);
  const r = RFila.parse(data);
  // Micros de dólar → céntimos de euro: un crédito (1 céntimo) vale `valor` micros de dólar.
  const valor = valorCreditoUsdMicros(env);
  const aCentimos = (micros: number) => Math.round(micros / valor);

  const porEmpresaMes = r.por_empresa_mes.map((f): FilaEmpresaMes => {
    const coste = aCentimos(f.coste_ia_usd_micros);
    return { empresaId: f.company_id, empresa: f.empresa, mes: f.mes, cobradoCentimos: f.cobrado_centimos, creditosConsumidos: f.creditos_consumidos,
      costeIaCentimos: coste, margenCentimos: f.cobrado_centimos - coste, margenPct: margenPct(f.cobrado_centimos, coste) };
  });
  // Peor margen primero; sin cobros (margen desconocido) al final.
  const porAgente = r.por_agente.map((f): FilaAgente => {
    const coste = aCentimos(f.coste_ia_usd_micros);
    return { empresa: f.empresa, agente: f.agente, tareas: f.tareas, creditosCobrados: f.creditos_cobrados, costeIaCentimos: coste,
      margenPct: margenPct(f.creditos_cobrados, coste), alertasMargen: f.alertas_margen };
  }).sort((a, b) => (a.margenPct ?? Infinity) - (b.margenPct ?? Infinity) || a.agente.localeCompare(b.agente, "es"));
  const porTipo = r.por_tipo.map((f): FilaTipo => ({
    tipo: f.tipo, tareas: f.tareas,
    costeMedioCentimos: f.tareas ? f.coste_ia_usd_micros / valor / f.tareas : 0,
    cobradoMedioCentimos: f.tareas ? f.creditos_cobrados / f.tareas : 0,
    margenPct: margenPct(f.creditos_cobrados, f.coste_ia_usd_micros / valor),
  }));
  return {
    mes, cambioUsdPorEur: valor / 10_000, porEmpresaMes, porAgente, porTipo,
    saldoVivo: { creditos: r.saldo_vivo.creditos, euros: r.saldo_vivo.creditos / 100, empresas: r.saldo_vivo.empresas },
    caducadosMes: r.caducados_mes, alertas: r.alertas, umbralMargen: UMBRAL_ALERTA_MARGEN,
  };
}
