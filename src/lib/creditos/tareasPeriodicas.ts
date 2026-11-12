/**
 * Tareas periódicas del sistema de créditos. Solo servidor. Cada una recibe la fecha actual (`ahora`) para poder
 * probar cada transición sin esperar días reales. Las lanza `/api/cron/<tarea>` (con CRON_SECRET) o `npm run cron`.
 *
 *  caducar-creditos  (diaria)  caduca lotes vencidos y avisa 7 días antes de los que tienen más de 1.000 créditos.
 *  revisar-estados   (diaria)  pausa por inactividad, pasa a pendiente de borrado, lista los borrados vencidos.
 *  renovar-bonos     (diaria)  SOLO LOCAL: simula la renovación del bono mensual. En producción lo hará Stripe.
 *  rutinas           (cada hora) procesa las rutinas vencidas de los agentes.
 *  renovar-conexiones (cada 15 min) renueva los tokens de las aplicaciones conectadas que caducan pronto.
 *  procesar-pendientes (cada 5 min) la cola: ejecuta las tareas que ya existen con su origen (eventos, traspasos, rutinas, seguimientos).
 *                    Ningún cron lanza a un agente para que «revise» o «busque trabajo»: solo ejecuta tareas con un motivo concreto.
 *  control-calidad    (cada hora) proceso interno de MyOfia (muestreo con Haiku). Solo con CONTROL_CALIDAD_AUTOMATICO=true.
 *  examenes-certificacion (cada 5 min) ejecuta los exámenes técnicos de certificación pendientes (en segundo plano).
 *  recertificacion   (diaria)  30 días antes de que caduque una certificación crea la solicitud «periódica» y avisa; caducada, pausa al agente.
 *  abrir-aplazadas   (cada 15 min) procesa los mensajes que llegaron fuera de horario (regla «no responder») cuando abre el horario.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ServicioCreditos } from "./servicio.ts";
import { ejecutarRutinasVencidas, sumarMeses, type Lanzador } from "./rutinas.ts";
import { CICLO_DE_VIDA } from "./tarifas.ts";
import { renovarConexionesPorCaducar } from "../integraciones/renovar.ts";
import type { ResultadoAplazadas } from "../agentes/reglas/aplazadas.ts";
import type { ResultadoTraspasos } from "../agentes/traspasos/procesar.ts";
import { muestrearYAlertar } from "../calidad/servicio.ts";

export const TAREAS_PERIODICAS = ["caducar-creditos", "revisar-estados", "renovar-bonos", "recertificacion", "control-calidad", "rutinas", "renovar-conexiones", "abrir-aplazadas", "procesar-pendientes", "examenes-certificacion", "leads-meta"] as const;
export type TareaPeriodica = (typeof TAREAS_PERIODICAS)[number];

export type DepsTareas = {
  db: SupabaseClient;
  servicio: ServicioCreditos;
  /** La fecha «de hoy»: inyectada para poder simular el paso del tiempo. */
  ahora: Date;
  log?: Pick<Console, "info" | "warn" | "error">;
  /** Los caminos que simulan a Stripe (bono mensual) solo funcionan en local. */
  esLocal: boolean;
  /** Limita la pasada a una sola empresa (pruebas y ejecuciones manuales). Sin él, actúa sobre todas. */
  empresaId?: string;
  /** Cómo se lanza una rutina. Sin él, `rutinas` solo informa de lo que haría. */
  lanzarRutina?: Lanzador;
  /** Cómo se procesan las tareas aplazadas por horario. Sin él, `abrir-aplazadas` solo informa de cuántas hay. */
  procesarAplazadas?: (ahora: Date, empresaId?: string) => Promise<ResultadoAplazadas>;
  /** Cómo se ejecuta la cola de tareas pendientes. Sin él, `procesar-pendientes` solo informa. */
  procesarTraspasos?: (empresaId?: string) => Promise<ResultadoTraspasos>;
  /** Cómo se ejecutan los exámenes de certificación pendientes. Sin él, `examenes-certificacion` solo informa. */
  procesarExamenes?: (empresaId?: string, opciones?: { excluirTipos?: string[] }) => Promise<{ procesados: number; errores: string[]; omitidos?: number }>;
  /**
   * Procesos internos automáticos de MyOfia con IA (muestreo de calidad y exámenes de recertificación periódica). Nunca los hacen los
   * agentes de la empresa. Solo con CONTROL_CALIDAD_AUTOMATICO=true; en pruebas y por defecto, desactivados.
   */
  controlCalidadAutomatico?: boolean;
  /** Puntúa con Haiku las muestras reales ya anonimizada. Sin evaluador, se muestrea y se alertan las señales acumuladas. */
  procesarMuestrasCalidad?: (empresaId?: string) => Promise<{ evaluadas: number; revision: number; errores: number; alertas: number }>;
  /** Procesa los avisos de leads de Meta pendientes (y sus reintentos). Sin él, `leads-meta` solo cuenta cuántos esperan. */
  procesarLeadsMeta?: () => Promise<{ resultados: { estado: string }[] }>;
};

async function rpc<T>(db: SupabaseClient, fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await db.rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data as T;
}

/** 1) Caducidad de lotes + aviso previo. */
export async function caducarCreditos(d: DepsTareas) {
  const log = d.log ?? console;
  const c = await rpc<{ lotes: number; creditos: number; empresas: string[] }>(d.db, "caducar_lotes", { p_ahora: d.ahora.toISOString(), p_company_id: d.empresaId ?? null });
  // Caducar créditos baja el saldo: se revisa el estado de las empresas afectadas (avisos, «sin saldo»).
  for (const empresa of c.empresas) await d.servicio.revisarEstado(empresa);
  const avisados = await rpc<number>(d.db, "avisar_lotes_por_caducar", {
    p_ahora: d.ahora.toISOString(), p_dias: CICLO_DE_VIDA.avisoCaducidadDias, p_min_creditos: CICLO_DE_VIDA.avisoCaducidadMinCreditos,
    p_company_id: d.empresaId ?? null,
  });
  log.info(`[cron] caducar-creditos: ${c.lotes} lotes caducados (${c.creditos} créditos), ${avisados} avisos de caducidad próxima.`);
  return { lotesCaducados: c.lotes, creditosCaducados: c.creditos, empresasRevisadas: c.empresas.length, avisosEnviados: avisados };
}

/** 2) Pausa, pendiente de borrado y borrados vencidos. */
export async function revisarEstados(d: DepsTareas) {
  const log = d.log ?? console;
  const r = await rpc<{ pausadas: string[]; pendientes_de_borrado: string[]; borrado_vencido: string[] }>(d.db, "avanzar_estados_oficina", {
    p_ahora: d.ahora.toISOString(),
    p_dias_inactividad: CICLO_DE_VIDA.diasSinActividadParaPausar,
    p_dias_pausada: CICLO_DE_VIDA.diasPausadaParaBorrado,
    p_dias_gracia: CICLO_DE_VIDA.diasDeGraciaBorrado,
    p_company_id: d.empresaId ?? null,
  });
  if (r.borrado_vencido.length) {
    // El borrado de datos NO está implementado (pendiente de que se confirme qué tablas se borran y cuáles se conservan).
    log.warn(`[cron] revisar-estados: ${r.borrado_vencido.length} empresa(s) con el borrado vencido, SIN BORRAR (borrado no implementado todavía): ${r.borrado_vencido.join(", ")}`);
  }
  log.info(`[cron] revisar-estados: ${r.pausadas.length} pausadas, ${r.pendientes_de_borrado.length} pendientes de borrado.`);
  return { pausadas: r.pausadas, pendientesDeBorrado: r.pendientes_de_borrado, borradoVencido: r.borrado_vencido, borradoEjecutado: false };
}

/**
 * 3) Renovación del bono mensual — SOLO PARA LOCAL.
 * En producción el bono lo renovará el webhook de Stripe (invoice.paid de la suscripción) llamando a `anadirCreditos`
 * con el id del evento como clave de idempotencia (prompt 9). Este camino simula ese cobro y, por eso, no hace nada
 * fuera de local: nunca se deben regalar créditos por una renovación que nadie ha pagado.
 */
export async function renovarBonos(d: DepsTareas) {
  const log = d.log ?? console;
  if (!d.esLocal) {
    log.warn("[cron] renovar-bonos: omitido (solo local). En producción renueva el webhook de Stripe.");
    return { omitido: "solo_local" as const, renovados: 0, errores: 0 };
  }
  let q = d.db.from("company_credit_settings").select("company_id, bono_mensual_pack_id, bono_proxima_renovacion_en")
    .not("bono_mensual_pack_id", "is", null).lte("bono_proxima_renovacion_en", d.ahora.toISOString());
  if (d.empresaId) q = q.eq("company_id", d.empresaId);
  const { data, error } = await q;
  if (error) throw new Error(`renovar-bonos: ${error.message}`);
  let renovados = 0;
  let errores = 0;
  for (const f of (data ?? []) as { company_id: string; bono_mensual_pack_id: string; bono_proxima_renovacion_en: string }[]) {
    const toca = new Date(f.bono_proxima_renovacion_en);
    // Una clave por periodo: reintentar el mismo mes nunca añade el bono dos veces.
    const clave = `bono:${f.company_id}:${toca.toISOString()}`;
    try {
      const lote = await d.servicio.anadirCreditos(f.company_id, f.bono_mensual_pack_id as never, "bono_mensual", `simulado:${clave}`, clave);
      // Siguiente renovación: la primera fecha futura de la serie (los meses perdidos no se regalan).
      let proxima = sumarMeses(toca, 1);
      for (let n = 2; proxima.getTime() <= d.ahora.getTime() && n < 600; n++) proxima = sumarMeses(toca, n);
      await d.db.from("company_credit_settings").update({ bono_proxima_renovacion_en: proxima.toISOString() })
        .eq("company_id", f.company_id).eq("bono_proxima_renovacion_en", f.bono_proxima_renovacion_en);
      if (!lote.duplicado) {
        renovados++;
        await d.db.from("notifications").insert({
          company_id: f.company_id, tipo: "bono_renovado", titulo: "Bono mensual renovado (simulado en local)",
          cuerpo: `Se han añadido ${lote.creditos} créditos del bono del pack ${f.bono_mensual_pack_id}.`, metadatos: { lote_id: lote.loteId, simulado: true },
        });
      }
    } catch (e) {
      errores++;
      log.error(`[cron] renovar-bonos ${f.company_id}:`, e instanceof Error ? e.message : e);
    }
  }
  log.info(`[cron] renovar-bonos (simulado, solo local): ${renovados} bonos renovados, ${errores} errores.`);
  return { omitido: null, renovados, errores };
}

/** 4) Rutinas de los agentes. */
export async function ejecutarRutinas(d: DepsTareas) {
  const r = await ejecutarRutinasVencidas({ db: d.db, ahora: d.ahora, lanzar: d.lanzarRutina, log: d.log, empresaId: d.empresaId });
  (d.log ?? console).info(`[cron] rutinas: ${r.vencidas} vencidas, ${r.lanzadas} lanzadas, ${r.omitidasPorOficina} omitidas (oficina no activa), ${r.errores} errores${d.lanzarRutina ? "" : `, ${r.pendientesDeLanzar.length} pendientes (sin lanzador: solo informa)`}.`);
  return r;
}

/** 5) Conexiones con aplicaciones externas: renueva los tokens que caducan pronto (y pasa a «caducado», avisando, los que no se pueden renovar). */
export async function renovarConexiones(d: DepsTareas) {
  return renovarConexionesPorCaducar({ db: d.db, env: process.env, fetch, ahora: () => d.ahora, log: d.log ?? console }, d.empresaId);
}

/** 6) Mensajes aplazados por horario: se procesan al abrir. Sin motor (sin clave de Claude), solo cuenta cuántos hay vencidos. */
export async function abrirAplazadas(d: DepsTareas) {
  const log = d.log ?? console;
  if (!d.procesarAplazadas) {
    let q = d.db.from("tasks").select("id", { count: "exact", head: true }).eq("status", "scheduled").lte("aplazada_hasta", d.ahora.toISOString());
    if (d.empresaId) q = q.eq("company_id", d.empresaId);
    const { count, error } = await q;
    if (error) throw new Error("abrir-aplazadas: no se pudieron contar las tareas.");
    log.warn(`[cron] abrir-aplazadas: ${count ?? 0} tareas vencidas SIN PROCESAR (no hay motor de agentes configurado: falta ANTHROPIC_API_KEY o la base).`);
    return { vencidas: count ?? 0, reanudadas: 0, procesadas: false };
  }
  const r = await d.procesarAplazadas(d.ahora, d.empresaId);
  return { vencidas: r.vencidas, reanudadas: r.reanudadas, errores: r.errores, procesadas: true };
}

/** 7) La cola: tareas que ya existen con su origen (eventos, traspasos, rutinas, seguimientos). Sin motor, solo cuenta cuántas esperan. */
export async function procesarPendientes(d: DepsTareas) {
  const log = d.log ?? console;
  if (!d.procesarTraspasos) {
    const { data, error } = await d.db.rpc("tareas_pendientes_de_ejecutar", { p_limite: 1000, p_company_id: d.empresaId ?? null });
    if (error) throw new Error("procesar-pendientes: no se pudieron leer las tareas.");
    const n = (data as unknown[] | null)?.length ?? 0;
    log.warn(`[cron] procesar-pendientes: ${n} tareas SIN EJECUTAR (no hay motor de agentes configurado).`);
    return { pendientes: n, ejecutadas: 0, procesadas: false };
  }
  const r = await d.procesarTraspasos(d.empresaId);
  return { ejecutadas: r.ejecutadas, errores: r.errores, bloqueadas: r.bloqueadas, procesadas: true };
}

/** 8) Exámenes técnicos de certificación pendientes. Sin motor (sin clave de Claude), solo cuenta cuántos esperan. */
export async function examenesDeCertificacion(d: DepsTareas) {
  const log = d.log ?? console;
  if (!d.procesarExamenes) {
    let q = d.db.from("certification_requests").select("id", { count: "exact", head: true }).eq("estado", "pendiente_examen");
    if (d.empresaId) q = q.eq("company_id", d.empresaId);
    const { count, error } = await q;
    if (error) throw new Error("examenes-certificacion: no se pudieron contar las solicitudes.");
    log.warn(`[cron] examenes-certificacion: ${count ?? 0} exámenes SIN EJECUTAR (no hay motor de agentes configurado).`);
    return { pendientes: count ?? 0, procesados: 0, procesadas: false };
  }
  // Las recertificaciones periódicas son un proceso interno automático: solo con CONTROL_CALIDAD_AUTOMATICO=true.
  const r = await d.procesarExamenes(d.empresaId, d.controlCalidadAutomatico ? {} : { excluirTipos: ["periodica"] });
  return { procesados: r.procesados, errores: r.errores, omitidosPorControlAutomatico: r.omitidos ?? 0, procesadas: true };
}

/**
 * 9) Recertificación periódica de los agentes (diaria). A falta de `DIAS_AVISO_RECERTIFICACION` días para que caduque una certificación,
 * crea la solicitud «periódica» (su examen lo recoge `examenes-certificacion`) y avisa a la empresa. Si llega la fecha sin certificar,
 * el agente activo pasa a «pausado» con su motivo. Todo en la base, atómico, y una sola vez por periodo.
 */
export const DIAS_AVISO_RECERTIFICACION = 30;
export async function recertificacion(d: DepsTareas) {
  const r = await rpc<{ pausados: string[]; solicitadas: string[] }>(d.db, "certificacion_recertificacion_diaria", {
    p_ahora: d.ahora.toISOString(), p_dias: DIAS_AVISO_RECERTIFICACION, p_company_id: d.empresaId ?? null,
  });
  (d.log ?? console).info(`[cron] recertificacion: ${r.solicitadas.length} solicitudes periódicas creadas, ${r.pausados.length} agentes pausados por certificación caducada.`);
  return { solicitadas: r.solicitadas, pausados: r.pausados };
}

/** 10) Control continuo: toma el porcentaje configurable de tareas reales y Haiku puntúa la misma rúbrica del examen. */
export async function controlCalidad(d: DepsTareas) {
  if (!d.controlCalidadAutomatico) {
    (d.log ?? console).info("[cron] control-calidad: omitido (CONTROL_CALIDAD_AUTOMATICO no está a true).");
    return { omitido: "CONTROL_CALIDAD_AUTOMATICO desactivado", muestras: 0, alertas: 0, evaluadas: 0, enRevision: 0, errores: 0, procesadas: false };
  }
  const base = await muestrearYAlertar(d.db, d.ahora, d.empresaId);
  if (!d.procesarMuestrasCalidad) {
    (d.log ?? console).warn(`[cron] control-calidad: ${base.muestras} muestras creadas, ${base.alertas} alertas; SIN EVALUAR (falta ANTHROPIC_API_KEY).`);
    return { ...base, evaluadas: 0, enRevision: 0, errores: 0, procesadas: false };
  }
  const r = await d.procesarMuestrasCalidad(d.empresaId);
  (d.log ?? console).info(`[cron] control-calidad: ${base.muestras} muestras, ${r.evaluadas} evaluadas, ${r.revision} a revisión, ${r.alertas + base.alertas} alertas.`);
  return { ...base, evaluadas: r.evaluadas, enRevision: r.revision, errores: r.errores, procesadas: true };
}

/** 10) Leads de Meta Lead Ads pendientes: los que no se procesaron al llegar y los reintentos con su espera cumplida. */
export async function leadsMeta(d: DepsTareas) {
  if (!d.procesarLeadsMeta) {
    const { count, error } = await d.db.from("meta_lead_events").select("id", { count: "exact", head: true }).eq("estado", "recibido");
    if (error) throw new Error("leads-meta: no se pudieron contar los avisos pendientes.");
    return { pendientes: count ?? 0, procesados: false };
  }
  const { resultados } = await d.procesarLeadsMeta();
  const cuenta = (e: string) => resultados.filter((r) => r.estado === e).length;
  return { procesados: true, total: resultados.length, ok: cuenta("procesado"), ignorados: cuenta("ignorado"), reintentos: cuenta("reintento"), errores: cuenta("error") };
}

const TAREAS: Record<TareaPeriodica, (d: DepsTareas) => Promise<unknown>> = {
  "leads-meta": leadsMeta,
  recertificacion,
  "control-calidad": controlCalidad,
  "caducar-creditos": caducarCreditos, "revisar-estados": revisarEstados, "renovar-bonos": renovarBonos, rutinas: ejecutarRutinas,
  "renovar-conexiones": renovarConexiones, "abrir-aplazadas": abrirAplazadas, "procesar-pendientes": procesarPendientes,
  "examenes-certificacion": examenesDeCertificacion,
};
export const ejecutarTareaPeriodica = (tarea: TareaPeriodica, d: DepsTareas) => TAREAS[tarea](d);
