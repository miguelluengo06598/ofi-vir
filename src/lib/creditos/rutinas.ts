/**
 * Rutinas programadas de los agentes: cada una guarda su tipo de tarea, su frecuencia y su límite de ejecuciones al mes, y muestra su
 * coste estimado al mes (tarifa × ejecuciones, con el límite). Solo servidor.
 *  - Solo las crea una persona desde la interfaz (nunca un agente ni una plantilla) y nacen DESACTIVADAS (lo impone la base).
 *  - Solo se lanzan las ACTIVADAS por una persona (queda quién y cuándo), si la oficina está operativa y sin pasar su límite del mes.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { costeMensualRutina, type FrecuenciaRutina, type TipoDeTareaId } from "./tarifas.ts";

/** La oficina ejecuta agentes y rutinas solo en estos estados (con saldo bajo sigue trabajando; sin saldo, pausada o pendiente de borrado, no). */
export const ESTADOS_QUE_EJECUTAN: readonly string[] = ["activa", "saldo_bajo"];
export const oficinaPuedeEjecutar = (estado: string | null | undefined): boolean => ESTADOS_QUE_EJECUTAN.includes(estado ?? "");

/** Estado de la oficina (null si la empresa no existe). */
export async function estadoDeOficina(db: SupabaseClient, companyId: string): Promise<string | null> {
  const { data, error } = await db.from("company_credit_settings").select("estado_oficina").eq("company_id", companyId).maybeSingle();
  if (error) throw new Error(`No se pudo leer el estado de la oficina: ${error.message}`);
  return (data as { estado_oficina: string } | null)?.estado_oficina ?? null;
}

// ── Fechas ──────────────────────────────────────────────────────────────────────────────────────
/** Suma meses en UTC; si el día no existe en el mes de destino (31 → febrero), se queda en su último día. */
export function sumarMeses(d: Date, meses: number): Date {
  const r = new Date(d.getTime());
  const dia = r.getUTCDate();
  r.setUTCDate(1);
  r.setUTCMonth(r.getUTCMonth() + meses);
  const ultimo = new Date(Date.UTC(r.getUTCFullYear(), r.getUTCMonth() + 1, 0)).getUTCDate();
  r.setUTCDate(Math.min(dia, ultimo));
  return r;
}

const HORA = 3_600_000;
const DIA = 24 * HORA;

/** Siguiente ejecución tras `desde` (los días laborables se cuentan en UTC: lunes a viernes). */
export function siguienteEjecucion(frecuencia: FrecuenciaRutina, desde: Date): Date {
  switch (frecuencia) {
    case "cada_hora": return new Date(desde.getTime() + HORA);
    case "diaria": return new Date(desde.getTime() + DIA);
    case "semanal": return new Date(desde.getTime() + 7 * DIA);
    case "mensual": return sumarMeses(desde, 1);
    case "laborables": {
      let d = new Date(desde.getTime() + DIA);
      while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d = new Date(d.getTime() + DIA);
      return d;
    }
  }
}

/** Primera ejecución futura (> ahora) de la serie que empezó en `desde`: así no se acumulan ejecuciones atrasadas. */
export function proximaDespuesDe(frecuencia: FrecuenciaRutina, desde: Date, ahora: Date): Date {
  let d = siguienteEjecucion(frecuencia, desde);
  for (let i = 0; d.getTime() <= ahora.getTime() && i < 200_000; i++) d = siguienteEjecucion(frecuencia, d);
  return d;
}

// ── Lectura ─────────────────────────────────────────────────────────────────────────────────────
export type Rutina = {
  id: string; companyId: string; agentId: string; nombre: string; instruccion: string;
  tipoTarea: TipoDeTareaId; frecuencia: FrecuenciaRutina; activa: boolean;
  proximaEjecucionEn: Date; ultimaEjecucionEn: Date | null;
  descripcion: string | null; creadoPor: string | null; activadaPor: string | null; activadaEn: Date | null;
  maxEjecucionesMes: number; ejecucionesMes: number; mesContador: string | null; sugeridaDe: string | null;
  /** Créditos al mes que costaría (tarifa del tipo × ejecuciones al mes de su frecuencia, como mucho su límite). */
  costeMensualEstimado: number;
  /** Valor tal cual lo devuelve la base (sirve para reclamar la rutina sin perder precisión). */
  _proximaRaw: string;
};

type Fila = {
  id: string; company_id: string; agent_id: string; nombre: string; instruccion: string; tipo_tarea: TipoDeTareaId;
  frecuencia: FrecuenciaRutina; activa: boolean; proxima_ejecucion_en: string; ultima_ejecucion_en: string | null;
  descripcion: string | null; creado_por: string | null; activada_por: string | null; activada_en: string | null;
  max_ejecuciones_mes: number; ejecuciones_mes: number; mes_contador: string | null; sugerida_de: string | null;
};
const aRutina = (f: Fila): Rutina => ({
  id: f.id, companyId: f.company_id, agentId: f.agent_id, nombre: f.nombre, instruccion: f.instruccion,
  tipoTarea: f.tipo_tarea, frecuencia: f.frecuencia, activa: f.activa,
  proximaEjecucionEn: new Date(f.proxima_ejecucion_en), ultimaEjecucionEn: f.ultima_ejecucion_en ? new Date(f.ultima_ejecucion_en) : null,
  descripcion: f.descripcion, creadoPor: f.creado_por, activadaPor: f.activada_por, activadaEn: f.activada_en ? new Date(f.activada_en) : null,
  maxEjecucionesMes: f.max_ejecuciones_mes, ejecucionesMes: f.ejecuciones_mes, mesContador: f.mes_contador, sugeridaDe: f.sugerida_de,
  costeMensualEstimado: costeMensualRutina(f.tipo_tarea, f.frecuencia, f.max_ejecuciones_mes), _proximaRaw: f.proxima_ejecucion_en,
});

/** Rutinas de una empresa con su coste estimado al mes. */
export async function listarRutinas(db: SupabaseClient, companyId: string): Promise<Rutina[]> {
  const { data, error } = await db.from("agent_routines").select("*").eq("company_id", companyId).order("creado_en");
  if (error) throw new Error(`No se pudieron leer las rutinas: ${error.message}`);
  return ((data ?? []) as Fila[]).map(aRutina);
}

// ── Ejecución ───────────────────────────────────────────────────────────────────────────────────
/** Lanza una rutina (crear la tarea, reservar créditos, ejecutar el agente…). La conecta quien use el motor. */
export type Lanzador = (rutina: Rutina) => Promise<void>;

export type ResultadoRutinas = {
  vencidas: number; lanzadas: number; omitidasPorOficina: number; omitidasPorLimite: number; errores: number;
  /** Modo de prueba (sin lanzador): rutinas que se habrían lanzado. No se toca su calendario. */
  pendientesDeLanzar: string[];
};

/**
 * Procesa las rutinas vencidas (`proxima_ejecucion_en <= ahora`):
 *  - oficina no operativa → NO se ejecuta; su calendario avanza igualmente (sin acumular atrasadas para cuando se reactive);
 *  - oficina operativa → se reclama (una sola ejecución aunque se solape otra pasada) y se llama a `lanzar`.
 * Sin `lanzar` solo informa (no cambia nada).
 */
export async function ejecutarRutinasVencidas(o: {
  db: SupabaseClient; ahora: Date; lanzar?: Lanzador; log?: Pick<Console, "info" | "warn" | "error">; empresaId?: string;
}): Promise<ResultadoRutinas> {
  const { db, ahora, lanzar } = o;
  const log = o.log ?? console;
  const r: ResultadoRutinas = { vencidas: 0, lanzadas: 0, omitidasPorOficina: 0, omitidasPorLimite: 0, errores: 0, pendientesDeLanzar: [] };

  // Solo las activadas por una persona.
  let q = db.from("agent_routines").select("*").eq("activa", true).not("activada_por", "is", null).lte("proxima_ejecucion_en", ahora.toISOString()).order("proxima_ejecucion_en");
  if (o.empresaId) q = q.eq("company_id", o.empresaId);
  const { data, error } = await q;
  if (error) throw new Error(`No se pudieron leer las rutinas vencidas: ${error.message}`);
  const rutinas = ((data ?? []) as Fila[]).map(aRutina);
  r.vencidas = rutinas.length;
  if (rutinas.length === 0) return r;

  const empresas = [...new Set(rutinas.map((x) => x.companyId))];
  const { data: ajustes, error: e2 } = await db.from("company_credit_settings").select("company_id, estado_oficina").in("company_id", empresas);
  if (e2) throw new Error(`No se pudo leer el estado de las oficinas: ${e2.message}`);
  const estado = new Map(((ajustes ?? []) as { company_id: string; estado_oficina: string }[]).map((a) => [a.company_id, a.estado_oficina]));

  for (const x of rutinas) {
    const operativa = oficinaPuedeEjecutar(estado.get(x.companyId));
    if (operativa && !lanzar) { r.pendientesDeLanzar.push(x.id); continue; }
    const proxima = proximaDespuesDe(x.frecuencia, x.proximaEjecucionEn, ahora);
    // Reclamo atómico en la base: solo gana quien la encuentra todavía con la fecha que leyó; cuenta la ejecución del mes.
    const { data: reclamo, error: e3 } = await db.rpc("rutina_reclamar", {
      p_id: x.id, p_proxima_leida: x._proximaRaw, p_proxima_nueva: proxima.toISOString(), p_ahora: ahora.toISOString(), p_operativa: operativa,
    });
    if (e3) { r.errores++; log.error(`[rutinas] ${x.id}: no se pudo reclamar: ${e3.message}`); continue; }
    if (reclamo === "no") continue;
    if (reclamo === "limite") {
      r.omitidasPorLimite++;
      log.info(`[rutinas] ${x.id} («${x.nombre}») no se ejecuta: ha llegado a su límite de ${x.maxEjecucionesMes} ejecuciones este mes.`);
      continue;
    }
    if (!operativa) {
      r.omitidasPorOficina++;
      log.info(`[rutinas] ${x.id} («${x.nombre}») no se ejecuta: la oficina está ${estado.get(x.companyId) ?? "desconocida"}.`);
      continue;
    }
    try {
      await lanzar!(x);
      r.lanzadas++;
    } catch (e) {
      r.errores++;
      log.error(`[rutinas] ${x.id} («${x.nombre}») falló al lanzarse:`, e instanceof Error ? e.message : e);
    }
  }
  return r;
}
