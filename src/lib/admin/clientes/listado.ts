/**
 * Listado de clientes de MyOfia: una fila por empresa con metadatos y agregados (función SQL admin_clientes_listado, solo
 * service_role), su salud y los filtros. Nunca lee contenido de las empresas. Solo servidor.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { calcularSalud, type Color, type Salud } from "./salud.ts";

export type Cliente = {
  id: string; nombre: string; sector: string | null; estado: string; suspendidaMotivo: string | null; creadaEn: string;
  propietario: { id: string; nombre: string; email: string } | null;
  agentesActivos: number; agentesSuspendidos: number; consumoMes: number; saldo: number;
  ultimaActividad: string | null; estadoOficina: string | null; oficinaPausada: boolean; pausadaPorSamgple: boolean;
  enImplantacion: boolean; responsable: { id: string; nombre: string } | null;
  valoracionesNegativas: number; valoracionesTotal: number; recargasFallidas: number;
  salud: Salud;
};

const n = (v: unknown) => Number(v ?? 0) || 0;

export async function obtenerClientes(db: SupabaseClient, ahora = new Date(), soloId?: string): Promise<Cliente[]> {
  const consulta = db.rpc("admin_clientes_listado", { p_ahora: ahora.toISOString() });
  const { data, error } = soloId ? await consulta.eq("id", soloId) : await consulta;
  if (error) throw new Error(`No se pudo leer el listado de clientes (${error.code ?? "sin código"}).`);
  return ((data ?? []) as Record<string, unknown>[]).map((r) => {
    const base = {
      id: r.id as string, nombre: r.nombre as string, sector: (r.sector as string | null) ?? null, estado: r.estado as string,
      suspendidaMotivo: (r.suspendida_motivo as string | null) ?? null, creadaEn: r.creada_en as string,
      propietario: r.propietario_id ? { id: r.propietario_id as string, nombre: (r.propietario_nombre as string | null) ?? "—", email: (r.propietario_email as string | null) ?? "" } : null,
      agentesActivos: n(r.agentes_activos), agentesSuspendidos: n(r.agentes_suspendidos), consumoMes: n(r.consumo_mes), saldo: n(r.saldo),
      ultimaActividad: (r.ultima_actividad as string | null) ?? null, estadoOficina: (r.estado_oficina as string | null) ?? null,
      oficinaPausada: r.oficina_pausada === true, pausadaPorSamgple: r.pausada_por_samgple === true, enImplantacion: r.en_implantacion === true,
      responsable: r.responsable_id ? { id: r.responsable_id as string, nombre: (r.responsable_nombre as string | null) ?? "Equipo MyOfia" } : null,
      valoracionesNegativas: n(r.valoraciones_negativas), valoracionesTotal: n(r.valoraciones_total), recargasFallidas: n(r.recargas_fallidas),
    };
    return { ...base, salud: calcularSalud({ estadoEmpresa: base.estado, estadoOficina: base.estadoOficina, ultimaActividad: base.ultimaActividad, saldo: base.saldo, valoracionesNegativas: base.valoracionesNegativas, valoracionesTotal: base.valoracionesTotal, agentesSuspendidos: base.agentesSuspendidos, recargasFallidas: base.recargasFallidas }, ahora) };
  });
}

/** Filtros del listado (vienen de la URL: se validan y lo que no vale se ignora). */
export const FiltrosSchema = z.object({
  q: z.string().trim().max(100).optional().catch(undefined),
  estado: z.enum(["en_implantacion", "activa", "suspendida", "borrada"]).optional().catch(undefined),
  sector: z.string().trim().max(80).optional().catch(undefined),
  implantacion: z.literal("1").optional().catch(undefined),
  saldoBajo: z.literal("1").optional().catch(undefined),
  riesgo: z.literal("1").optional().catch(undefined),
  salud: z.enum(["verde", "ambar", "rojo"]).optional().catch(undefined),
  responsable: z.union([z.uuid(), z.literal("ninguno")]).optional().catch(undefined),
});
export type Filtros = z.infer<typeof FiltrosSchema>;

export function leerFiltros(params: Record<string, string | string[] | undefined>): Filtros {
  const plano = Object.fromEntries(Object.entries(params).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]).filter(([, v]) => v !== undefined && v !== ""));
  return FiltrosSchema.parse(plano);
}

const sinTildes = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

export function filtrarClientes(clientes: Cliente[], f: Filtros): Cliente[] {
  const q = f.q ? sinTildes(f.q) : null;
  return clientes.filter((c) => {
    if (q && ![c.nombre, c.sector ?? "", c.propietario?.nombre ?? "", c.propietario?.email ?? ""].some((t) => sinTildes(t).includes(q))) return false;
    if (f.estado ? c.estado !== f.estado : c.estado === "borrada") return false; // las borradas solo se ven filtrándolas
    if (f.sector && c.sector !== f.sector) return false;
    if (f.implantacion && !c.enImplantacion) return false;
    if (f.saldoBajo && !(c.estadoOficina === "saldo_bajo" || c.estadoOficina === "sin_saldo")) return false;
    if (f.riesgo && c.salud.color !== "rojo") return false;
    if (f.salud && c.salud.color !== f.salud) return false;
    if (f.responsable === "ninguno" && c.responsable) return false;
    if (f.responsable && f.responsable !== "ninguno" && c.responsable?.id !== f.responsable) return false;
    return true;
  });
}

export const contarPorColor = (clientes: Cliente[]): Record<Color, number> =>
  clientes.reduce((a, c) => ({ ...a, [c.salud.color]: a[c.salud.color] + 1 }), { verde: 0, ambar: 0, rojo: 0 } as Record<Color, number>);

/** Personas de MyOfia que pueden ser responsables de un cliente (para el filtro y la ficha). */
export async function equipoSamgple(db: SupabaseClient): Promise<{ id: string; nombre: string }[]> {
  const { data, error } = await db.from("platform_roles").select("user_id, nombre").eq("activo", true).order("nombre");
  if (error) throw new Error("No se pudo leer el equipo de MyOfia.");
  return (data ?? []).map((p) => ({ id: p.user_id as string, nombre: (p.nombre as string | null) ?? "Equipo MyOfia" }));
}
