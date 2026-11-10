/**
 * Servicio de créditos. SOLO SERVIDOR: usa la clave `service_role` de Supabase, que nunca debe llegar al navegador.
 *
 * Toda la lógica de descuento vive en la base de datos (funciones SQL atómicas de la migración de créditos):
 * aquí solo se validan las entradas, se llama a esas funciones y, después de cada consumo o compra, se revisa
 * el estado de la oficina (avisos de saldo bajo, «sin saldo», recarga automática).
 *
 * Idempotencia: toda operación que cobra o añade créditos acepta una clave; repetirla devuelve el resultado
 * anterior (`duplicado: true`) sin cobrar dos veces.
 *
 * Uso rápido:
 *   const r = await reservar(empresa, tareaId, creditosParaTarea("estandar"));   // antes de ejecutar
 *   ...ejecutar la tarea...
 *   await confirmar(r.reservaId, creditosParaTarea("estandar"), { tipo: "estandar", agentId });  // ok
 *   await liberar(r.reservaId);                                                                    // fallo nuestro
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { CONSUMOS_FIJOS, TIPOS_DE_TAREA, TipoDeTareaIdSchema, type ConsumoFijoId } from "./tarifas.ts";

if (typeof window !== "undefined") throw new Error("src/lib/creditos/servicio.ts solo puede ejecutarse en el servidor.");

// ── Tipos públicos ───────────────────────────────────────────────────────────────────────────────
export const MOTIVOS_SIN_PERMISO = ["sin_saldo", "tope_mensual", "oficina_pausada"] as const;
export type MotivoSinPermiso = (typeof MOTIVOS_SIN_PERMISO)[number];

export type CodigoError =
  | MotivoSinPermiso
  | "reserva_no_encontrada" | "reserva_no_activa" | "gasto_supera_reserva"
  | "pack_invalido" | "pack_ya_usado" | "entrada_invalida" | "error_interno";

export class CreditosError extends Error {
  readonly codigo: CodigoError;
  constructor(codigo: CodigoError, mensaje: string) {
    super(mensaje);
    this.codigo = codigo;
    this.name = "CreditosError";
  }
}

export type LoteVivo = {
  id: string; origen: string; packId: string | null;
  creditosIniciales: number; creditosRestantes: number; caducaEn: string; creadoEn: string;
};
export type Saldo = {
  /** Lo que se puede gastar ahora: lotes vivos − reservas activas (nunca negativo). */
  disponible: number;
  /** Créditos apartados por tareas en curso. */
  reservado: number;
  /** Créditos en lotes vivos (disponible + reservado). */
  enLotes: number;
  /** Lotes con créditos y sin caducar, el que caduca antes primero. */
  lotes: LoteVivo[];
  /** Créditos consumidos en el mes natural (hora de Madrid). */
  consumidosEsteMes: number;
};
export type PuedeGastar = { ok: true; motivo: null } | { ok: false; motivo: MotivoSinPermiso; mensaje: string };

export type ResultadoConsumo = { operacionId: string; consumido: number; saldo: number; duplicado: boolean };
export type ResultadoReserva = { reservaId: string; reservado: number; saldo: number; duplicado: boolean };
export type ResultadoConfirmacion = ResultadoConsumo & { liberado: number; reservaId: string };
export type ResultadoLiberacion = { reservaId: string; liberado: number; saldo: number; duplicado: boolean };
export type ResultadoLote = { loteId: string; creditos: number | null; caducaEn: string | null; saldo: number; duplicado: boolean };

export type RefsConsumo = { taskId?: string; agentId?: string; departmentId?: string; metadatos?: Record<string, unknown> };
export type DetallesConfirmacion = {
  /** Tipo de tarea de precio fijo: fija el concepto del libro. Imprescindible si no se da `concepto`. */
  tipo?: z.infer<typeof TipoDeTareaIdSchema>;
  concepto?: string;
  agentId?: string; departmentId?: string;
  /** Por defecto `confirmar:<reservaId>`: reintentar la confirmación nunca cobra dos veces. */
  claveIdempotencia?: string;
  metadatos?: Record<string, unknown>;
};

/** Hueco para Stripe (prompt 9). En local, la recarga automática se simula con un lote; en producción no hace nada. */
export type IniciarRecarga = (p: { companyId: string; packId: string; claveIdempotencia: string }) => Promise<void>;

export type DepsCreditos = {
  db: SupabaseClient;
  log?: Pick<Console, "info" | "warn" | "error">;
  /** Por defecto: entorno de desarrollo + Supabase en 127.0.0.1/localhost. */
  esLocal?: boolean;
  iniciarRecarga?: IniciarRecarga;
  ahora?: () => Date;
};

// ── Validación ───────────────────────────────────────────────────────────────────────────────────
export type PackId = "prueba" | "inicio" | "pro" | "business" | "empresa";
const Uuid = z.string().uuid();
const Creditos = z.number().int().positive().max(100_000_000);
const Clave = z.string().min(8).max(200);
const Meta = z.record(z.string(), z.unknown()).default({});

const RConsumo = z.object({ operacion_id: z.string(), consumido: z.number().int(), saldo: z.number().int(), duplicado: z.boolean() }).loose();
const RReserva = z.object({ reserva_id: z.string(), reservado: z.number().int(), saldo: z.number().int(), duplicado: z.boolean() }).loose();
const RConfirmacion = RConsumo.extend({ liberado: z.number().int().optional(), reserva_id: z.string().nullish() });
const RLiberacion = z.object({ reserva_id: z.string(), liberado: z.number().int(), saldo: z.number().int(), duplicado: z.boolean() }).loose();
const RLote = z.object({
  lot_id: z.string(), creditos: z.number().int().optional(), caduca_en: z.string().optional(), saldo: z.number().int(), duplicado: z.boolean(),
}).loose();
const RRevision = z.object({
  estado: z.string(), anterior: z.string(), porcentaje: z.number(), creditos: z.number().int(), base: z.number().int(),
  avisos: z.array(z.string()),
  recarga_auto: z.object({ pack_id: z.string(), ultimo_lote_id: z.string().nullable() }).nullable(),
}).loose();
export type RevisionEstado = z.infer<typeof RRevision>;

const ERRORES_SQL: Record<string, CodigoError> = {
  CR001: "sin_saldo", CR002: "reserva_no_encontrada", CR003: "reserva_no_activa", CR004: "gasto_supera_reserva",
  CR005: "pack_invalido", CR006: "pack_ya_usado", "22023": "entrada_invalida",
};

function traducir(e: { code?: string; message: string }): CreditosError {
  const codigo = ERRORES_SQL[e.code ?? ""] ?? (e.message.startsWith("SALDO_INSUFICIENTE") ? "sin_saldo" : "error_interno");
  return new CreditosError(codigo, e.message);
}

function validar<T>(esquema: z.ZodType<T>, valor: unknown): T {
  const r = esquema.safeParse(valor);
  if (!r.success) throw new CreditosError("entrada_invalida", r.error.issues.map((i) => `${i.path.join(".") || "valor"}: ${i.message}`).join("; "));
  return r.data;
}

function esEntornoLocal(env: Record<string, string | undefined> = process.env): boolean {
  return env.NODE_ENV !== "production" && /^https?:\/\/(127\.0\.0\.1|localhost)[:/]/.test(env.NEXT_PUBLIC_SUPABASE_URL ?? "");
}

// ── El servicio ──────────────────────────────────────────────────────────────────────────────────
export function crearServicioCreditos(deps: DepsCreditos) {
  const { db } = deps;
  const log = deps.log ?? console;
  const ahora = deps.ahora ?? (() => new Date());
  const esLocal = deps.esLocal ?? esEntornoLocal();

  async function rpc<T>(nombre: string, args: Record<string, unknown>, esquema: z.ZodType<T>): Promise<T> {
    const { data, error } = await db.rpc(nombre, args);
    if (error) throw traducir(error);
    const r = esquema.safeParse(data);
    if (!r.success) throw new CreditosError("error_interno", `Respuesta inesperada de ${nombre}: ${r.error.message}`);
    return r.data;
  }
  async function leer<T>(consulta: PromiseLike<{ data: T | null; error: { code?: string; message: string } | null }>): Promise<T | null> {
    const { data, error } = await consulta;
    if (error) throw traducir(error);
    return data;
  }

  const consumidosMes = (companyId: string) => rpc("creditos_consumidos_mes", { p_company_id: companyId, p_ahora: ahora().toISOString() }, z.number().int());

  async function ajustes(companyId: string) {
    const f = await leer(db.from("company_credit_settings").select("estado_oficina, tope_mensual_creditos").eq("company_id", companyId).maybeSingle());
    if (!f) throw new CreditosError("entrada_invalida", `La empresa ${companyId} no existe o no tiene ajustes de créditos.`);
    return f as { estado_oficina: string; tope_mensual_creditos: number | null };
  }

  // 1) Saldo ----------------------------------------------------------------------------------------
  async function obtenerSaldo(companyId: string): Promise<Saldo> {
    validar(Uuid, companyId);
    const [balance, lotes, mes] = await Promise.all([
      leer(db.from("company_credit_balance").select("creditos_en_lotes, creditos_reservados, saldo_disponible").eq("company_id", companyId).maybeSingle()),
      leer(db.from("credit_lots").select("id, origen, pack_id, creditos_iniciales, creditos_restantes, caduca_en, creado_en")
        .eq("company_id", companyId).gt("creditos_restantes", 0).gt("caduca_en", ahora().toISOString()).order("caduca_en").order("creado_en")),
      consumidosMes(companyId),
    ]);
    if (!balance) throw new CreditosError("entrada_invalida", `La empresa ${companyId} no existe.`);
    const b = balance as { creditos_en_lotes: number; creditos_reservados: number; saldo_disponible: number };
    return {
      disponible: b.saldo_disponible, reservado: b.creditos_reservados, enLotes: b.creditos_en_lotes,
      lotes: ((lotes ?? []) as Record<string, unknown>[]).map((l) => ({
        id: l.id as string, origen: l.origen as string, packId: (l.pack_id as string | null) ?? null,
        creditosIniciales: l.creditos_iniciales as number, creditosRestantes: l.creditos_restantes as number,
        caducaEn: l.caduca_en as string, creadoEn: l.creado_en as string,
      })),
      consumidosEsteMes: mes,
    };
  }

  // 2) ¿Se puede gastar? ------------------------------------------------------------------------------
  // Orden: oficina pausada → sin saldo → tope mensual. Una oficina «pendiente de borrado» cuenta como pausada.
  // El tope cuenta lo ya consumido + lo reservado por tareas en curso + lo que se pide. Es una comprobación previa:
  // el saldo, en cambio, lo garantiza la base de datos (nunca puede quedar negativo).
  async function puedeGastar(companyId: string, creditos: number): Promise<PuedeGastar> {
    validar(Uuid, companyId);
    validar(Creditos, creditos);
    const [a, balance, mes] = await Promise.all([
      ajustes(companyId),
      leer(db.from("company_credit_balance").select("creditos_reservados, saldo_disponible").eq("company_id", companyId).maybeSingle()),
      consumidosMes(companyId),
    ]);
    const b = (balance ?? { creditos_reservados: 0, saldo_disponible: 0 }) as { creditos_reservados: number; saldo_disponible: number };
    if (a.estado_oficina === "pausada" || a.estado_oficina === "pendiente_borrado") {
      return { ok: false, motivo: "oficina_pausada", mensaje: `La oficina está ${a.estado_oficina === "pausada" ? "pausada" : "pendiente de borrado"}.` };
    }
    if (b.saldo_disponible < creditos) {
      return { ok: false, motivo: "sin_saldo", mensaje: `Se necesitan ${creditos} créditos y hay ${b.saldo_disponible} disponibles.` };
    }
    const tope = a.tope_mensual_creditos;
    if (tope !== null && mes + b.creditos_reservados + creditos > tope) {
      return { ok: false, motivo: "tope_mensual", mensaje: `Superaría el tope mensual de ${tope} créditos (consumidos ${mes}, reservados ${b.creditos_reservados}).` };
    }
    return { ok: true, motivo: null };
  }

  async function exigirPermiso(companyId: string, creditos: number) {
    const r = await puedeGastar(companyId, creditos);
    if (!r.ok) throw new CreditosError(r.motivo, r.mensaje);
  }

  // 3) Reservar -----------------------------------------------------------------------------------------
  /** Reserva antes de ejecutar una tarea. Expira a los 15 minutos si no se confirma ni se libera. Reintentar es seguro. */
  async function reservar(companyId: string, taskId: string, creditos: number, refs: { agentId?: string; departmentId?: string } = {}): Promise<ResultadoReserva> {
    validar(Uuid, companyId); validar(Uuid, taskId); validar(Creditos, creditos);
    // Un reintento no debe fallar por culpa de su propia reserva (que ya resta del saldo y del tope).
    const previa = await leer(db.from("credit_reservations").select("id, creditos").eq("company_id", companyId).eq("task_id", taskId).eq("estado", "activa").maybeSingle());
    if (!previa) await exigirPermiso(companyId, creditos);
    const r = await rpc("reservar_creditos", {
      p_company_id: companyId, p_task_id: taskId, p_creditos: creditos,
      p_agent_id: refs.agentId ?? null, p_department_id: refs.departmentId ?? null, p_ttl_segundos: 15 * 60,
    }, RReserva);
    return { reservaId: r.reserva_id, reservado: r.reservado, saldo: r.saldo, duplicado: r.duplicado };
  }

  async function reserva(reservaId: string) {
    validar(Uuid, reservaId);
    const f = await leer(db.from("credit_reservations").select("company_id, task_id, estado").eq("id", reservaId).maybeSingle());
    if (!f) throw new CreditosError("reserva_no_encontrada", `La reserva ${reservaId} no existe.`);
    return f as { company_id: string; task_id: string; estado: string };
  }

  // 4) Confirmar ----------------------------------------------------------------------------------------
  /** Consume lo realmente gastado (≤ lo reservado) y libera el resto. Para precio fijo: creditosReales = precio del tipo. */
  async function confirmar(reservaId: string, creditosReales: number, detalles: DetallesConfirmacion = {}): Promise<ResultadoConfirmacion> {
    validar(Uuid, reservaId);
    validar(z.number().int().min(0).max(100_000_000), creditosReales);
    const concepto = detalles.concepto ?? (detalles.tipo ? TIPOS_DE_TAREA[validar(TipoDeTareaIdSchema, detalles.tipo)].concepto : undefined);
    if (!concepto) throw new CreditosError("entrada_invalida", "confirmar necesita `tipo` o `concepto` para anotar el consumo.");
    const clave = validar(Clave, detalles.claveIdempotencia ?? `confirmar:${reservaId}`);
    const f = await reserva(reservaId);
    const r = await rpc("confirmar_reserva", {
      p_company_id: f.company_id, p_reserva_id: reservaId, p_creditos_gastados: creditosReales, p_concepto: concepto,
      p_agent_id: detalles.agentId ?? null, p_department_id: detalles.departmentId ?? null,
      p_clave_idempotencia: clave, p_metadatos: validar(Meta, detalles.metadatos),
    }, RConfirmacion);
    if (!r.duplicado) await despuesDeMovimiento(f.company_id);
    return { operacionId: r.operacion_id, consumido: r.consumido, saldo: r.saldo, duplicado: r.duplicado, liberado: r.liberado ?? 0, reservaId };
  }

  // 5) Liberar ------------------------------------------------------------------------------------------
  /** La tarea falló por un error nuestro: no se cobra nada. Repetirlo es seguro. */
  async function liberar(reservaId: string): Promise<ResultadoLiberacion> {
    const f = await reserva(reservaId);
    const r = await rpc("liberar_reserva", { p_company_id: f.company_id, p_reserva_id: reservaId }, RLiberacion);
    return { reservaId: r.reserva_id, liberado: r.liberado, saldo: r.saldo, duplicado: r.duplicado };
  }

  // 6) Consumos fijos -----------------------------------------------------------------------------------
  /** Traspaso, correo o WhatsApp. La clave de idempotencia es obligatoria (p. ej. `correo:<id del correo>`). */
  async function cobrarConsumoFijo(companyId: string, concepto: ConsumoFijoId, refs: RefsConsumo, claveIdempotencia: string): Promise<ResultadoConsumo> {
    validar(Uuid, companyId);
    const creditos = CONSUMOS_FIJOS[validar(z.enum(["traspaso", "correo", "whatsapp"]), concepto)];
    const clave = validar(Clave, claveIdempotencia);
    const previo = await leer(db.from("credit_ledger").select("id").eq("company_id", companyId).eq("clave_idempotencia", clave).maybeSingle());
    if (!previo) await exigirPermiso(companyId, creditos);
    const r = await rpc("consumir_creditos", {
      p_company_id: companyId, p_creditos: creditos, p_concepto: concepto,
      p_task_id: refs.taskId ?? null, p_agent_id: refs.agentId ?? null, p_department_id: refs.departmentId ?? null,
      p_clave_idempotencia: clave, p_metadatos: validar(Meta, refs.metadatos),
    }, RConsumo);
    if (!r.duplicado) await despuesDeMovimiento(companyId);
    return { operacionId: r.operacion_id, consumido: r.consumido, saldo: r.saldo, duplicado: r.duplicado };
  }

  // 7) Añadir créditos ----------------------------------------------------------------------------------
  /** Crea el lote de un pack (con su caducidad). Resetea los avisos de saldo bajo y reactiva la oficina si estaba sin saldo. */
  async function anadirCreditos(
    companyId: string, packId: PackId, origen: "pack" | "bono_mensual" | "prueba", referenciaPago: string | null, claveIdempotencia: string,
    opciones: { permitirRecargaAuto?: boolean } = {},
  ): Promise<ResultadoLote> {
    validar(Uuid, companyId);
    validar(z.enum(["prueba", "inicio", "pro", "business", "empresa"]), packId);
    validar(z.enum(["pack", "bono_mensual", "prueba"]), origen);
    const clave = validar(Clave, claveIdempotencia);
    const r = await rpc("anadir_lote", {
      p_company_id: companyId, p_origen: origen, p_pack_id: packId, p_creditos: null, p_dias_caducidad: null,
      p_referencia_pago: referenciaPago, p_clave_idempotencia: clave,
    }, RLote);
    if (!r.duplicado) await despuesDeMovimiento(companyId, { nuevaCompra: true, permitirRecargaAuto: opciones.permitirRecargaAuto ?? true });
    return { loteId: r.lot_id, creditos: r.creditos ?? null, caducaEn: r.caduca_en ?? null, saldo: r.saldo, duplicado: r.duplicado };
  }

  // 8) Después de cada movimiento: actividad, avisos, «sin saldo» y recarga automática ----------------------
  // El movimiento ya está hecho y es definitivo: un fallo aquí se registra pero NO se propaga (el llamante no
  // debe creer que el cobro falló y reintentar). La revisión es idempotente: la próxima vez se corrige sola.
  async function despuesDeMovimiento(companyId: string, o: { nuevaCompra?: boolean; permitirRecargaAuto?: boolean } = {}): Promise<RevisionEstado | null> {
    try {
      const rev = await rpc("revisar_estado_creditos", { p_company_id: companyId, p_nueva_compra: o.nuevaCompra ?? false }, RRevision);
      if (rev.avisos.length) log.info(`[creditos] ${companyId}: avisos ${rev.avisos.join(", ")} (${Math.round(rev.porcentaje * 100)} %, ${rev.creditos} créditos)`);
      if (rev.estado !== rev.anterior) log.info(`[creditos] ${companyId}: estado ${rev.anterior} → ${rev.estado}`);
      if (rev.recarga_auto && (o.permitirRecargaAuto ?? true)) {
        // Mismo «episodio» = misma última compra: la clave no cambia hasta que haya otra compra.
        const clave = `recarga_auto:${companyId}:${rev.recarga_auto.ultimo_lote_id ?? "sin_compras"}`;
        try {
          await (deps.iniciarRecarga ?? recargaPorDefecto)({ companyId, packId: rev.recarga_auto.pack_id, claveIdempotencia: clave });
        } catch (e) {
          // Alerta interna para el equipo de IDESIE (panel /admin/margenes). Sin datos personales: solo el pack y el tipo de fallo.
          log.error(`[creditos] ${companyId}: falló la recarga automática del pack ${rev.recarga_auto.pack_id}:`, e);
          await db.from("internal_alerts").insert({ tipo: "recarga_fallida", company_id: companyId, detalle: { pack: rev.recarga_auto.pack_id, error: e instanceof CreditosError ? e.codigo : "desconocido" } });
        }
      }
      return rev;
    } catch (e) {
      log.error(`[creditos] ${companyId}: falló la revisión posterior al movimiento (el cobro sí se hizo):`, e);
      return null;
    }
  }

  const recargaPorDefecto: IniciarRecarga = async ({ companyId, packId, claveIdempotencia }) => {
    if (!esLocal) {
      // TODO (prompt 9): cobrar con Stripe y crear el lote desde el webhook de pago, con esta misma clave.
      log.warn(`[creditos] ${companyId}: recarga automática del pack ${packId} PENDIENTE de conectar a Stripe (clave ${claveIdempotencia}).`);
      return;
    }
    const r = await anadirCreditos(companyId, packId as PackId, "pack", `simulado:${claveIdempotencia}`, claveIdempotencia, { permitirRecargaAuto: false });
    if (r.duplicado) return;
    log.info(`[creditos] ${companyId}: recarga automática SIMULADA (local): pack ${packId}, +${r.creditos} créditos, lote ${r.loteId}.`);
    await db.from("notifications").insert({
      company_id: companyId, tipo: "recarga_automatica", titulo: "Recarga automática (simulada en local)",
      cuerpo: `Se ha añadido el pack ${packId} (+${r.creditos} créditos).`, metadatos: { pack_id: packId, lote_id: r.loteId, simulada: true },
    });
  };

  /** Recalcula estado, avisos y recarga automática de una empresa (tras caducar créditos, por ejemplo). */
  const revisarEstado = (companyId: string) => despuesDeMovimiento(validar(Uuid, companyId));

  return { obtenerSaldo, puedeGastar, reservar, confirmar, liberar, cobrarConsumoFijo, anadirCreditos, revisarEstado };
}

export type ServicioCreditos = ReturnType<typeof crearServicioCreditos>;

// ── Instancia por defecto (lee la configuración del entorno la primera vez que se usa) ───────────────
let porDefecto: ServicioCreditos | null = null;
function servicio(): ServicioCreditos {
  if (!porDefecto) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.");
    porDefecto = crearServicioCreditos({ db: createClient(url, key, { auth: { persistSession: false } }) });
  }
  return porDefecto;
}

export const obtenerSaldo: ServicioCreditos["obtenerSaldo"] = (...a) => servicio().obtenerSaldo(...a);
export const puedeGastar: ServicioCreditos["puedeGastar"] = (...a) => servicio().puedeGastar(...a);
export const reservar: ServicioCreditos["reservar"] = (...a) => servicio().reservar(...a);
export const confirmar: ServicioCreditos["confirmar"] = (...a) => servicio().confirmar(...a);
export const liberar: ServicioCreditos["liberar"] = (...a) => servicio().liberar(...a);
export const cobrarConsumoFijo: ServicioCreditos["cobrarConsumoFijo"] = (...a) => servicio().cobrarConsumoFijo(...a);
export const anadirCreditos: ServicioCreditos["anadirCreditos"] = (...a) => servicio().anadirCreditos(...a);
