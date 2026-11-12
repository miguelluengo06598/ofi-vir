/**
 * Única fuente de verdad de lo que cuesta cada cosa en créditos (1 crédito = 1 céntimo de euro).
 * Créditos y dinero son SIEMPRE enteros: nada de decimales (el dinero, en céntimos; el coste de IA, en
 * millonésimas de dólar). Los packs NO están aquí: viven en la tabla `credit_packs` (ver `packs.ts`).
 * Módulo puro (sin base de datos ni red): se puede usar en servidor, en tests y en la interfaz.
 */
import { z } from "zod";

// ── Modelos ─────────────────────────────────────────────────────────────────────────────────────
/** Identificadores de la API de Claude (los mismos que usa el motor de agentes). */
export const MODELOS = { haiku: "claude-haiku-5-5", sonnet: "claude-sonnet-5-5" } as const;
export type ModeloId = (typeof MODELOS)[keyof typeof MODELOS];

// ── Tipos de tarea ──────────────────────────────────────────────────────────────────────────────
const entero = (min: number) => z.number().int().min(min).max(Number.MAX_SAFE_INTEGER);

const TipoDeTareaSchema = z.object({
  /** Créditos que se cobran por una tarea de este tipo, sea cual sea su coste real de IA. */
  creditos: entero(1),
  /** Concepto con el que se anota en `credit_ledger`. */
  concepto: z.string().min(1),
  modeloPorDefecto: z.enum([MODELOS.haiku, MODELOS.sonnet]),
  /** Modelos que puede usar una tarea de este tipo si el agente lo pide. */
  modelosPermitidos: z.array(z.enum([MODELOS.haiku, MODELOS.sonnet])).min(1),
  /** Máximo de llamadas al modelo por tarea. Al alcanzarlo, la tarea pasa a revisión. */
  maxPasos: entero(1),
  /** Tope de tokens de salida de CADA llamada al modelo (incluye el razonamiento). */
  maxTokensSalida: entero(1),
});
export type TipoDeTarea = z.infer<typeof TipoDeTareaSchema>;

export const TIPOS_DE_TAREA_IDS = ["simple", "estandar", "experta"] as const;
export type TipoDeTareaId = (typeof TIPOS_DE_TAREA_IDS)[number];
export const TipoDeTareaIdSchema = z.enum(TIPOS_DE_TAREA_IDS);

export const TIPOS_DE_TAREA: Readonly<Record<TipoDeTareaId, TipoDeTarea>> = Object.freeze(
  z
    .record(TipoDeTareaIdSchema, TipoDeTareaSchema)
    .parse({
      simple: {
        creditos: 2, concepto: "tarea_simple",
        modeloPorDefecto: MODELOS.haiku, modelosPermitidos: [MODELOS.haiku],
        maxPasos: 3, maxTokensSalida: 4000,
      },
      estandar: {
        creditos: 10, concepto: "tarea_estandar",
        modeloPorDefecto: MODELOS.haiku, modelosPermitidos: [MODELOS.haiku, MODELOS.sonnet],
        maxPasos: 6, maxTokensSalida: 8000,
      },
      experta: {
        creditos: 50, concepto: "tarea_experta",
        modeloPorDefecto: MODELOS.sonnet, modelosPermitidos: [MODELOS.sonnet],
        maxPasos: 12, maxTokensSalida: 16000,
      },
    }) as Record<TipoDeTareaId, TipoDeTarea>,
);

// ── Consumos fijos (no son tareas de IA) ────────────────────────────────────────────────────────
export const CONSUMOS_FIJOS = Object.freeze(
  z
    .object({ traspaso: entero(1), correo: entero(1), whatsapp: entero(1) })
    .parse({
      /** Traspaso entre departamentos. */
      traspaso: 1,
      /** Correo enviado. */
      correo: 1,
      // TODO: pendiente de la tarifa real de Meta. 5 es un valor provisional para poder construir el flujo.
      whatsapp: 5,
    }),
);
export type ConsumoFijoId = keyof typeof CONSUMOS_FIJOS;

// ── Simulador de agentes ────────────────────────────────────────────────────────────────────────
/**
 * Cuánto cuesta probar un agente en el simulador. Cada empresa tiene `gratisAlMes` simulaciones gratis (por defecto 50; variable
 * `SIMULACIONES_GRATIS_MES`; 0 = todas se cobran). Pasada la cuota, cada simulación cuesta lo que una tarea del tipo `tipoTarea` (simple).
 * Cada simulación, gratis o no, queda registrada en `task_costs` con su coste real de IA.
 */
export const SIMULADOR_POR_DEFECTO = Object.freeze({ gratisAlMes: 50, tipoTarea: "simple" as TipoDeTareaId });
export function leerConfigSimulador(env: Record<string, string | undefined> = process.env): { gratisAlMes: number; tipoTarea: TipoDeTareaId } {
  const crudo = env.SIMULACIONES_GRATIS_MES?.trim();
  if (!crudo) return { ...SIMULADOR_POR_DEFECTO };
  const n = Number(crudo);
  if (!Number.isInteger(n) || n < 0 || n > 100_000) throw new Error(`Variable SIMULACIONES_GRATIS_MES no válida («${crudo}»): debe ser un entero de 0 a 100000.`);
  return { gratisAlMes: n, tipoTarea: SIMULADOR_POR_DEFECTO.tipoTarea };
}

// ── Alerta de margen ────────────────────────────────────────────────────────────────────────────
/** Si el coste real de IA de una tarea supera esta fracción de lo cobrado, se registra una alerta interna. */
export const UMBRAL_ALERTA_MARGEN = 0.5;

// ── Precios de los modelos (USD por millón de tokens) ───────────────────────────────────────────
// Se guardan como ENTEROS en «micro-USD por millón de tokens» (0,10 $ → 100 000) para que el coste salga
// exacto: con ese precio, tokens × precio / 1 000 000 son directamente millonésimas de dólar.
const PrecioUsd = z.preprocess(
  (v) => (v === undefined || (typeof v === "string" && v.trim() === "") ? undefined : v),
  z.coerce.number().positive().finite().max(1000).optional(),
);
const PRECIOS_POR_DEFECTO_USD = {
  PRECIO_HAIKU_ENTRADA_USD: 0.1, PRECIO_HAIKU_SALIDA_USD: 0.5,
  // Lectura de caché de Haiku: no está en el encargo; se supone el 10 % de la entrada (como en Sonnet). Confirmar.
  PRECIO_HAIKU_CACHE_USD: 0.01,
  PRECIO_SONNET_ENTRADA_USD: 2, PRECIO_SONNET_SALIDA_USD: 10, PRECIO_SONNET_CACHE_USD: 0.1,
} as const;

export type PreciosModelo = { entrada: number; salida: number; cache: number };
export type PreciosPorModelo = Readonly<Record<ModeloId, PreciosModelo>>;

const aMicros = (usd: number) => Math.round(usd * 1_000_000);

/** Lee y valida los precios del entorno (con valores por defecto). Lanza si algún valor no es un número válido. */
export function leerPrecios(env: Record<string, string | undefined> = process.env): PreciosPorModelo {
  const v = (k: keyof typeof PRECIOS_POR_DEFECTO_USD) => {
    const r = PrecioUsd.safeParse(env[k]);
    if (!r.success) throw new Error(`Variable ${k} no válida («${env[k]}»): debe ser un número de dólares por millón de tokens, mayor que 0.`);
    return aMicros(r.data ?? PRECIOS_POR_DEFECTO_USD[k]);
  };
  return {
    [MODELOS.haiku]: { entrada: v("PRECIO_HAIKU_ENTRADA_USD"), salida: v("PRECIO_HAIKU_SALIDA_USD"), cache: v("PRECIO_HAIKU_CACHE_USD") },
    [MODELOS.sonnet]: { entrada: v("PRECIO_SONNET_ENTRADA_USD"), salida: v("PRECIO_SONNET_SALIDA_USD"), cache: v("PRECIO_SONNET_CACHE_USD") },
  };
}

const TokensSchema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER / 1e9);

/**
 * Coste real de IA de una llamada o tarea, en millonésimas de dólar (entero, redondeado hacia arriba para
 * no subestimar nunca el coste).
 *  - tokensEntrada: tokens de entrada que NO vienen de la caché.
 *  - tokensCache: tokens de entrada leídos de la caché (se cobran a la tarifa de caché).
 * No modela la ESCRITURA de caché (más cara que la entrada normal): quien llame puede sumarla a tokensEntrada.
 */
export function calcularCosteIA(
  modelo: string, tokensEntrada: number, tokensSalida: number, tokensCache = 0,
  precios: PreciosPorModelo = leerPrecios(),
): number {
  const p = (precios as Record<string, PreciosModelo | undefined>)[modelo];
  if (!p) throw new Error(`No hay precios para el modelo «${modelo}». Añádelos en tarifas.ts antes de usarlo.`);
  const e = TokensSchema.parse(tokensEntrada);
  const s = TokensSchema.parse(tokensSalida);
  const c = TokensSchema.parse(tokensCache);
  return Math.ceil((e * p.entrada + s * p.salida + c * p.cache) / 1_000_000);
}

// ── Cuánto cuesta una tarea ─────────────────────────────────────────────────────────────────────
export function creditosParaTarea(tipo: TipoDeTareaId): number {
  return TIPOS_DE_TAREA[TipoDeTareaIdSchema.parse(tipo)].creditos;
}

/** Créditos al mes de una rutina que ejecuta `ejecucionesPorMes` tareas de ese tipo. Siempre entero. */
export function estimarCreditosRutina(tipo: TipoDeTareaId, ejecucionesPorMes: number): number {
  const n = z.number().int().min(0).max(1_000_000).parse(ejecucionesPorMes);
  return creditosParaTarea(tipo) * n;
}

// ── Rutinas: frecuencia → ejecuciones al mes ────────────────────────────────────────────────────
export const FRECUENCIAS_RUTINA_IDS = ["cada_hora", "diaria", "laborables", "semanal", "mensual"] as const;
export type FrecuenciaRutina = (typeof FRECUENCIAS_RUTINA_IDS)[number];
export const FrecuenciaRutinaSchema = z.enum(FRECUENCIAS_RUTINA_IDS);

/** Ejecuciones al mes para estimar el coste (mes de 30 días; la semanal se redondea hacia arriba: 52/12 ≈ 4,3 → 5). */
export const EJECUCIONES_POR_MES: Readonly<Record<FrecuenciaRutina, number>> = Object.freeze(
  z.record(FrecuenciaRutinaSchema, entero(1)).parse({ cada_hora: 720, diaria: 30, laborables: 22, semanal: 5, mensual: 1 }) as Record<FrecuenciaRutina, number>,
);
export const ejecucionesPorMes = (f: FrecuenciaRutina): number => EJECUCIONES_POR_MES[FrecuenciaRutinaSchema.parse(f)];

/** Coste estimado al mes (en créditos) de una rutina: tarifa del tipo de tarea × ejecuciones al mes. */
export const costeMensualRutina = (tipo: TipoDeTareaId, frecuencia: FrecuenciaRutina, maxEjecucionesMes?: number): number =>
  estimarCreditosRutina(tipo, Math.min(ejecucionesPorMes(frecuencia), maxEjecucionesMes ?? Number.MAX_SAFE_INTEGER));

// ── Ciclo de vida de la oficina (tareas periódicas) ─────────────────────────────────────────────
export const CICLO_DE_VIDA = Object.freeze(
  z
    .object({
      /** Se avisa a la empresa cuando faltan estos días para que caduque un lote... */
      avisoCaducidadDias: entero(1),
      /** ...que tenga MÁS de estos créditos restantes. */
      avisoCaducidadMinCreditos: entero(0),
      /** Sin actividad (o sin saldo) durante estos días: la oficina se pausa. */
      diasSinActividadParaPausar: entero(1),
      /** Pausada durante estos días: pasa a pendiente de borrado. */
      diasPausadaParaBorrado: entero(1),
      /** Días entre el aviso de borrado y el borrado. */
      diasDeGraciaBorrado: entero(1),
    })
    .parse({
      avisoCaducidadDias: 7, avisoCaducidadMinCreditos: 1000,
      diasSinActividadParaPausar: 60, diasPausadaParaBorrado: 90, diasDeGraciaBorrado: 7,
    }),
);

/** Modelo con el que se ejecuta una tarea: el del agente si el tipo lo permite; si no, el del tipo. */
export function resolverModelo(tipo: TipoDeTareaId, modeloDelAgente?: string | null): ModeloId {
  const t = TIPOS_DE_TAREA[TipoDeTareaIdSchema.parse(tipo)];
  const pedido = t.modelosPermitidos.find((m) => m === modeloDelAgente);
  return pedido ?? t.modeloPorDefecto;
}

// ── Margen ──────────────────────────────────────────────────────────────────────────────────────
/** Dólares por euro. Solo sirve para comparar el coste de IA (USD) con lo cobrado (créditos = céntimos de euro). */
const CambioUsdPorEur = z.preprocess(
  (v) => (v === undefined || (typeof v === "string" && v.trim() === "") ? undefined : v),
  z.coerce.number().positive().finite().min(0.5).max(2).default(1.08),
);
/** Valor de un crédito en millonésimas de dólar (1 crédito = 0,01 €). */
export function valorCreditoUsdMicros(env: Record<string, string | undefined> = process.env): number {
  const r = CambioUsdPorEur.safeParse(env.CAMBIO_USD_POR_EUR);
  if (!r.success) throw new Error(`CAMBIO_USD_POR_EUR no válida («${env.CAMBIO_USD_POR_EUR}»): debe estar entre 0,5 y 2.`);
  return Math.round(r.data * 10_000);
}

export type EvaluacionMargen = { cobradoUsdMicros: number; ratio: number; alerta: boolean };

/** ¿El coste real de IA supera el umbral (50 %) de lo cobrado? Si no se cobró nada y hubo coste, siempre alerta. */
export function evaluarMargen(
  creditosCobrados: number, costeIaUsdMicros: number, env: Record<string, string | undefined> = process.env,
): EvaluacionMargen {
  const cr = entero(0).parse(creditosCobrados);
  const coste = entero(0).parse(costeIaUsdMicros);
  const cobradoUsdMicros = cr * valorCreditoUsdMicros(env);
  if (cobradoUsdMicros === 0) return { cobradoUsdMicros, ratio: coste > 0 ? Infinity : 0, alerta: coste > 0 };
  const ratio = coste / cobradoUsdMicros;
  return { cobradoUsdMicros, ratio, alerta: ratio > UMBRAL_ALERTA_MARGEN };
}

// ── IVA ─────────────────────────────────────────────────────────────────────────────────────────
/** IVA que se añade al precio de los packs (el precio del pack es la base imponible). */
export const IVA_PORCENTAJE = 21;
/** IVA en céntimos de un importe en céntimos (entero, redondeado al céntimo más próximo). */
export function calcularIvaCentimos(importeCentimos: number): number {
  return Math.round((entero(0).parse(importeCentimos) * IVA_PORCENTAJE) / 100);
}
