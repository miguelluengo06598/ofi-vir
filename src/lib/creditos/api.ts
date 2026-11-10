/**
 * Lógica de las rutas de API de créditos (/api/creditos/*). SOLO SERVIDOR. Las rutas de Next.js son un envoltorio fino
 * sobre estos manejadores, que reciben sus dependencias por parámetro para poder probarlos sin servidor web.
 *
 * Seguridad:
 *  - La empresa sale SIEMPRE de la sesión (JWT de Supabase Auth), nunca del cuerpo ni de la URL: los cuerpos se validan
 *    con zod en modo estricto, así que un `companyId` enviado por el cliente se rechaza.
 *  - Comprar, cancelar el bono y cambiar ajustes: solo propietarios y administradores. El resumen: cualquier miembro.
 *  - Sin pago real todavía, `comprar` solo añade créditos si PAGOS_SIMULADOS=true y NO es producción.
 */
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { fuenteDeCliente, getPack, getPacks } from "./packs.ts";
import { listarRutinas, oficinaPuedeEjecutar } from "./rutinas.ts";
import { CreditosError, type ServicioCreditos } from "./servicio.ts";
import { calcularIvaCentimos } from "./tarifas.ts";

import { esGestor, type RolEmpresa } from "../empresas/permisos.ts";
export { autenticadorSupabase, type Sesion } from "../empresas/sesion.ts";
import type { Sesion } from "../empresas/sesion.ts";
export type Rol = RolEmpresa;

export type DepsApi = {
  db: SupabaseClient;
  servicio: ServicioCreditos;
  autenticar: (req: Request) => Promise<Sesion | null>;
  /** Resultado de `pagosSimuladosActivos()`. Si es false, `comprar` nunca añade créditos. */
  pagosSimulados: boolean;
  ahora?: () => Date;
  log?: Pick<Console, "info" | "warn" | "error">;
};

// ── Entorno y sesión ─────────────────────────────────────────────────────────────────────────────
/** Los pagos simulados solo existen con PAGOS_SIMULADOS=true y fuera de producción (en producción, nunca). */
export function pagosSimuladosActivos(env: Record<string, string | undefined> = process.env): boolean {
  return env.NODE_ENV !== "production" && env.PAGOS_SIMULADOS?.trim().toLowerCase() === "true";
}

// ── Utilidades de respuesta ──────────────────────────────────────────────────────────────────────
const json = (cuerpo: unknown, status = 200) => Response.json(cuerpo, { status, headers: { "cache-control": "no-store" } });
const fallo = (status: number, error: string, mensaje: string, extra: Record<string, unknown> = {}) => json({ error, mensaje, ...extra }, status);

async function leerCuerpo(req: Request): Promise<{ ok: true; datos: unknown } | { ok: false; res: Response }> {
  const texto = await req.text();
  if (texto.trim() === "") return { ok: true, datos: {} };
  try {
    return { ok: true, datos: JSON.parse(texto) };
  } catch {
    return { ok: false, res: fallo(400, "json_invalido", "El cuerpo no es un JSON válido.") };
  }
}
const incidencias = (e: z.ZodError) => e.issues.map((i) => ({ campo: i.path.join(".") || null, mensaje: i.message }));

type Entrada = { sesion: Sesion } | { res: Response };
async function entrar(req: Request, deps: DepsApi, o: { admin: boolean }): Promise<Entrada> {
  const sesion = await deps.autenticar(req);
  if (!sesion) return { res: fallo(401, "no_autenticado", "Inicia sesión para continuar.") };
  if (o.admin && !esGestor(sesion.rol)) {
    return { res: fallo(403, "sin_permiso", "Solo los propietarios y administradores de la empresa pueden hacer esto.") };
  }
  return { sesion };
}

type Ajustes = {
  estado_oficina: string; tope_mensual_creditos: number | null; recarga_auto_activa: boolean; recarga_auto_umbral: number | null;
  recarga_auto_pack_id: string | null; bono_mensual_pack_id: string | null; bono_proxima_renovacion_en: string | null; prueba_usada: boolean;
};
const COLUMNAS_AJUSTES = "estado_oficina, tope_mensual_creditos, recarga_auto_activa, recarga_auto_umbral, recarga_auto_pack_id, bono_mensual_pack_id, bono_proxima_renovacion_en, prueba_usada";
async function leerAjustes(db: SupabaseClient, companyId: string): Promise<Ajustes> {
  const { data, error } = await db.from("company_credit_settings").select(COLUMNAS_AJUSTES).eq("company_id", companyId).single();
  if (error) throw new Error(`No se pudieron leer los ajustes: ${error.message}`);
  return data as Ajustes;
}
const ajustesParaCliente = (a: Ajustes) => ({
  topeMensualCreditos: a.tope_mensual_creditos,
  recargaAuto: { activa: a.recarga_auto_activa, umbral: a.recarga_auto_umbral, packId: a.recarga_auto_pack_id },
  bonoMensualPackId: a.bono_mensual_pack_id,
  bonoProximaRenovacionEn: a.bono_proxima_renovacion_en,
  pruebaUsada: a.prueba_usada,
});

function errorInterno(deps: DepsApi, donde: string, e: unknown) {
  (deps.log ?? console).error(`[api/creditos] ${donde}:`, e instanceof Error ? e.message : e);
  return fallo(500, "error_interno", "No se pudo completar la operación. Inténtalo de nuevo.");
}

// ── POST /api/creditos/comprar ───────────────────────────────────────────────────────────────────
const CompraSchema = z.object({
  packId: z.enum(["prueba", "inicio", "pro", "business", "empresa"]),
  modalidad: z.enum(["unico", "bono_mensual"]),
}).strict();

export async function comprarHandler(req: Request, deps: DepsApi): Promise<Response> {
  const entrada = await entrar(req, deps, { admin: true });
  if ("res" in entrada) return entrada.res;
  const { companyId } = entrada.sesion;

  // Sin pasarela de pago real, esta ruta NO puede añadir créditos salvo en local/pruebas.
  if (!deps.pagosSimulados) {
    return fallo(403, "pagos_no_disponibles", "La compra de créditos todavía no está disponible: no hay pasarela de pago configurada.");
  }
  const cuerpo = await leerCuerpo(req);
  if (!cuerpo.ok) return cuerpo.res;
  const v = CompraSchema.safeParse(cuerpo.datos);
  if (!v.success) return fallo(400, "datos_invalidos", "Los datos de la compra no son válidos.", { incidencias: incidencias(v.error) });
  const { packId, modalidad } = v.data;

  try {
    const pack = await getPack(packId, { fuente: fuenteDeCliente(deps.db) });
    if (!pack) return fallo(404, "pack_no_encontrado", "Ese pack no existe o no está disponible.");
    if (modalidad === "bono_mensual" && (pack.soloUnaVez || pack.creditosBonoMensual === null)) {
      return fallo(400, "pack_sin_bono", `El pack ${pack.nombre} no admite bono mensual.`);
    }
    const ajustes = await leerAjustes(deps.db, companyId);
    if (pack.soloUnaVez && ajustes.prueba_usada) return fallo(409, "pack_ya_usado", `El pack ${pack.nombre} solo se puede comprar una vez por empresa.`);

    // Bono mensual: se reserva primero (de forma atómica) para que dos peticiones a la vez no lo activen dos veces.
    if (modalidad === "bono_mensual") {
      const { data: reclamado, error } = await deps.db.from("company_credit_settings")
        .update({ bono_mensual_pack_id: packId }).eq("company_id", companyId).is("bono_mensual_pack_id", null).select("company_id");
      if (error) throw new Error(error.message);
      if (!reclamado?.length) return fallo(409, "bono_ya_activo", "Ya tienes un bono mensual activo. Cancélalo antes de contratar otro.");
    }

    const id = randomUUID();
    const importe = pack.precioCentimos;
    const iva = calcularIvaCentimos(importe);
    const { error: eCompra } = await deps.db.from("purchases").insert({
      id, company_id: companyId, pack_id: packId, modalidad, importe_centimos: importe, iva_centimos: iva,
      estado: "simulada", referencia_externa: `simulada:${id}`,
    });
    if (eCompra) {
      if (modalidad === "bono_mensual") await deps.db.from("company_credit_settings").update({ bono_mensual_pack_id: null }).eq("company_id", companyId).eq("bono_mensual_pack_id", packId);
      throw new Error(eCompra.message);
    }

    const origen = modalidad === "bono_mensual" ? "bono_mensual" : pack.soloUnaVez ? "prueba" : "pack";
    try {
      // El id de la compra es la clave de idempotencia: reintentar esta misma compra nunca añade los créditos dos veces.
      const lote = await deps.servicio.anadirCreditos(companyId, packId, origen, `simulada:${id}`, `compra:${id}`);
      const saldo = await deps.servicio.obtenerSaldo(companyId);
      return json({
        compra: { id, packId, modalidad, importeCentimos: importe, ivaCentimos: iva, totalCentimos: importe + iva, estado: "simulada" },
        lote: { id: lote.loteId, creditos: lote.creditos, caducaEn: lote.caducaEn },
        saldoDisponible: saldo.disponible,
        bonoMensualPackId: modalidad === "bono_mensual" ? packId : (await leerAjustes(deps.db, companyId)).bono_mensual_pack_id,
      }, 201);
    } catch (e) {
      await deps.db.from("purchases").update({ estado: "fallida" }).eq("id", id);
      if (modalidad === "bono_mensual") await deps.db.from("company_credit_settings").update({ bono_mensual_pack_id: null }).eq("company_id", companyId).eq("bono_mensual_pack_id", packId);
      if (e instanceof CreditosError && e.codigo === "pack_ya_usado") return fallo(409, "pack_ya_usado", `El pack ${pack.nombre} solo se puede comprar una vez por empresa.`, { compraId: id });
      if (e instanceof CreditosError && (e.codigo === "pack_invalido" || e.codigo === "entrada_invalida")) return fallo(400, e.codigo, "El pack no es válido.", { compraId: id });
      throw e;
    }
  } catch (e) {
    return errorInterno(deps, "comprar", e);
  }
}

// ── POST /api/creditos/cancelar-bono ─────────────────────────────────────────────────────────────
export async function cancelarBonoHandler(req: Request, deps: DepsApi): Promise<Response> {
  const entrada = await entrar(req, deps, { admin: true });
  if ("res" in entrada) return entrada.res;
  const cuerpo = await leerCuerpo(req);
  if (!cuerpo.ok) return cuerpo.res;
  const v = z.object({}).strict().safeParse(cuerpo.datos);
  if (!v.success) return fallo(400, "datos_invalidos", "Esta ruta no admite datos.", { incidencias: incidencias(v.error) });
  try {
    const { companyId } = entrada.sesion;
    const antes = await leerAjustes(deps.db, companyId);
    // Los créditos ya recibidos se conservan; solo se detiene la renovación (el trigger limpia la fecha).
    const { error } = await deps.db.from("company_credit_settings").update({ bono_mensual_pack_id: null }).eq("company_id", companyId);
    if (error) throw new Error(error.message);
    return json({ cancelado: antes.bono_mensual_pack_id !== null, bonoAnteriorPackId: antes.bono_mensual_pack_id });
  } catch (e) {
    return errorInterno(deps, "cancelar-bono", e);
  }
}

// ── PATCH /api/creditos/ajustes ──────────────────────────────────────────────────────────────────
const Credito = z.number().int().max(100_000_000);
const AjustesSchema = z.object({
  topeMensualCreditos: Credito.min(0).nullable().optional(),
  recargaAuto: z.object({
    activa: z.boolean().optional(),
    umbral: Credito.min(1).nullable().optional(),
    packId: z.enum(["inicio", "pro", "business", "empresa"]).nullable().optional(),
  }).strict().optional(),
}).strict().refine((o) => o.topeMensualCreditos !== undefined || (o.recargaAuto !== undefined && Object.keys(o.recargaAuto).length > 0), {
  message: "Indica al menos un ajuste que cambiar.",
});

export async function ajustesHandler(req: Request, deps: DepsApi): Promise<Response> {
  const entrada = await entrar(req, deps, { admin: true });
  if ("res" in entrada) return entrada.res;
  const cuerpo = await leerCuerpo(req);
  if (!cuerpo.ok) return cuerpo.res;
  const v = AjustesSchema.safeParse(cuerpo.datos);
  if (!v.success) return fallo(400, "datos_invalidos", "Los ajustes no son válidos.", { incidencias: incidencias(v.error) });
  try {
    const { companyId } = entrada.sesion;
    const actual = await leerAjustes(deps.db, companyId);
    const r = v.data.recargaAuto;
    const cambios: Record<string, unknown> = {};
    if (v.data.topeMensualCreditos !== undefined) cambios.tope_mensual_creditos = v.data.topeMensualCreditos;
    if (r?.activa !== undefined) cambios.recarga_auto_activa = r.activa;
    if (r?.umbral !== undefined) cambios.recarga_auto_umbral = r.umbral;
    if (r?.packId !== undefined) cambios.recarga_auto_pack_id = r.packId;
    // La recarga automática, para activarse, necesita umbral y pack (los nuevos o los que ya había).
    const activa = (cambios.recarga_auto_activa as boolean | undefined) ?? actual.recarga_auto_activa;
    const umbral = (cambios.recarga_auto_umbral as number | null | undefined) ?? actual.recarga_auto_umbral;
    const pack = (cambios.recarga_auto_pack_id as string | null | undefined) ?? actual.recarga_auto_pack_id;
    if (activa && (umbral === null || pack === null)) {
      return fallo(400, "recarga_incompleta", "Para activar la recarga automática hay que indicar el umbral y el pack.");
    }
    if (pack !== null && pack !== undefined) {
      const p = await getPack(pack as "inicio", { fuente: fuenteDeCliente(deps.db) });
      if (!p) return fallo(400, "pack_no_encontrado", "Ese pack no existe o no está disponible.");
    }
    const { error } = await deps.db.from("company_credit_settings").update(cambios).eq("company_id", companyId);
    if (error) throw new Error(error.message);
    return json({ ajustes: ajustesParaCliente(await leerAjustes(deps.db, companyId)) });
  } catch (e) {
    return errorInterno(deps, "ajustes", e);
  }
}

// ── GET /api/creditos/resumen ────────────────────────────────────────────────────────────────────
const RConsumo = z.object({
  total: z.number().int(),
  por_agente: z.array(z.object({ agent_id: z.string().nullable(), nombre: z.string(), creditos: z.number().int() })),
  por_departamento: z.array(z.object({ department_id: z.string().nullable(), nombre: z.string(), creditos: z.number().int() })),
  por_concepto: z.array(z.object({ concepto: z.string(), creditos: z.number().int() })),
});
const TIPOS_DE_TAREA_POR_CONCEPTO: Record<string, string> = { tarea_simple: "simple", tarea_estandar: "estandar", tarea_experta: "experta" };

export async function resumenHandler(req: Request, deps: DepsApi): Promise<Response> {
  const entrada = await entrar(req, deps, { admin: false });
  if ("res" in entrada) return entrada.res;
  const { companyId } = entrada.sesion;
  try {
    const ahora = (deps.ahora ?? (() => new Date()))();
    const [saldo, ajustes, consumoRaw, rutinas, packs] = await Promise.all([
      deps.servicio.obtenerSaldo(companyId),
      leerAjustes(deps.db, companyId),
      deps.db.rpc("resumen_consumo_mes", { p_company_id: companyId, p_ahora: ahora.toISOString() }),
      listarRutinas(deps.db, companyId),
      getPacks({ fuente: fuenteDeCliente(deps.db) }),
    ]);
    if (consumoRaw.error) throw new Error(consumoRaw.error.message);
    const consumo = RConsumo.parse(consumoRaw.data);
    const activas = rutinas.filter((r) => r.activa);
    return json({
      estadoOficina: { estado: ajustes.estado_oficina, puedeEjecutarAgentes: oficinaPuedeEjecutar(ajustes.estado_oficina) },
      saldo: { disponible: saldo.disponible, reservado: saldo.reservado, enLotes: saldo.enLotes, consumidosEsteMes: saldo.consumidosEsteMes },
      lotes: saldo.lotes,
      consumoMes: {
        total: consumo.total,
        porAgente: consumo.por_agente.map((x) => ({ agenteId: x.agent_id, nombre: x.nombre, creditos: x.creditos })),
        porDepartamento: consumo.por_departamento.map((x) => ({ departamentoId: x.department_id, nombre: x.nombre, creditos: x.creditos })),
        porTipoDeTarea: consumo.por_concepto.map((x) => ({ concepto: x.concepto, tipo: TIPOS_DE_TAREA_POR_CONCEPTO[x.concepto] ?? null, creditos: x.creditos })),
      },
      rutinas: {
        activas: activas.length,
        costeMensualEstimado: activas.reduce((n, r) => n + r.costeMensualEstimado, 0),
        detalle: activas.map((r) => ({ id: r.id, nombre: r.nombre, agenteId: r.agentId, tipoTarea: r.tipoTarea, frecuencia: r.frecuencia, costeMensualEstimado: r.costeMensualEstimado })),
      },
      ajustes: ajustesParaCliente(ajustes),
      packs: packs.map((p) => {
        const iva = calcularIvaCentimos(p.precioCentimos);
        return {
          id: p.id, nombre: p.nombre, creditos: p.creditos, creditosBonoMensual: p.creditosBonoMensual, diasCaducidad: p.diasCaducidad,
          importeCentimos: p.precioCentimos, ivaCentimos: iva, totalCentimos: p.precioCentimos + iva,
          disponible: !(p.soloUnaVez && ajustes.prueba_usada),
        };
      }),
    });
  } catch (e) {
    return errorInterno(deps, "resumen", e);
  }
}

// ── GET /api/creditos/movimientos ────────────────────────────────────────────────────────────────
const MovimientosQuery = z.object({
  tipo: z.enum(["compra", "consumo", "caducidad"]).optional(),
  pagina: z.coerce.number().int().min(1).max(100000).default(1),
  porPagina: z.coerce.number().int().min(1).max(100).default(20),
}).strict();

/** Historial del libro (una fila por operación), paginado y filtrable por tipo. Cualquier miembro; solo su empresa. */
export async function movimientosHandler(req: Request, deps: DepsApi): Promise<Response> {
  const entrada = await entrar(req, deps, { admin: false });
  if ("res" in entrada) return entrada.res;
  const { companyId } = entrada.sesion;
  const parsed = MovimientosQuery.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!parsed.success) return fallo(400, "datos_invalidos", "Los filtros no son válidos.", { incidencias: incidencias(parsed.error) });
  const { tipo, pagina, porPagina } = parsed.data;
  try {
    const { data, error } = await deps.db.rpc("movimientos_creditos", {
      p_company_id: companyId, p_tipo: tipo ?? null, p_limite: porPagina, p_desplazamiento: (pagina - 1) * porPagina,
    });
    if (error) throw new Error(error.message);
    const r = data as { total: number; movimientos: unknown[] };
    return json({ pagina, porPagina, total: r.total, totalPaginas: Math.max(1, Math.ceil(r.total / porPagina)), movimientos: r.movimientos });
  } catch (e) {
    return errorInterno(deps, "movimientos", e);
  }
}
