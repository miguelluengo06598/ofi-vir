/**
 * Panorama de la oficina de MyOfia. SOLO SERVIDOR. Llama a las funciones SQL de agregados
 * (admin_panorama, admin_series, admin_en_directo, admin_alertas: migración 20261112000100) y filtra lo que puede ver cada rol.
 * Nada de contenido de las empresas: solo cifras, nombres de empresa y de agente, y metadatos de los sucesos.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { RolPlataforma } from "@/lib/admin/acceso";
import { esperaDe, leerPlazos } from "@/lib/admin/certificacion/config";

export type IndicadorId =
  | "empresas_activas" | "empresas_implantacion" | "agentes_certificados" | "ventas_centimos" | "creditos_consumidos"
  | "coste_ia_centimos" | "margen_centimos" | "solicitudes_nuevas" | "cola_certificacion" | "alertas_abiertas";

export type Indicador = { id: IndicadorId; etiqueta: string; actual: number; anterior: number; formato: "numero" | "euros"; mejorSiSube: boolean; flujo: boolean };

const TODOS: RolPlataforma[] = ["admin_samgple", "comercial_samgple", "implantacion_samgple", "revisor_samgple", "soporte_samgple", "finanzas_samgple"];
const DINERO: RolPlataforma[] = ["admin_samgple", "finanzas_samgple"];

/** Qué ve cada rol (admin lo ve todo). Fuente única para la barra, las alertas y En directo. */
const INDICADORES: { id: IndicadorId; etiqueta: string; formato: Indicador["formato"]; mejorSiSube: boolean; flujo: boolean; roles: RolPlataforma[] }[] = [
  { id: "empresas_activas", etiqueta: "Empresas activas", formato: "numero", mejorSiSube: true, flujo: false, roles: TODOS },
  { id: "empresas_implantacion", etiqueta: "En implantación", formato: "numero", mejorSiSube: true, flujo: false, roles: ["admin_samgple", "comercial_samgple", "implantacion_samgple", "soporte_samgple"] },
  { id: "agentes_certificados", etiqueta: "Agentes activos y certificados", formato: "numero", mejorSiSube: true, flujo: false, roles: ["admin_samgple", "revisor_samgple", "implantacion_samgple", "soporte_samgple"] },
  { id: "ventas_centimos", etiqueta: "Créditos vendidos este mes", formato: "euros", mejorSiSube: true, flujo: true, roles: DINERO },
  { id: "creditos_consumidos", etiqueta: "Créditos consumidos", formato: "numero", mejorSiSube: true, flujo: true, roles: DINERO },
  { id: "coste_ia_centimos", etiqueta: "Coste de IA del mes", formato: "euros", mejorSiSube: false, flujo: true, roles: DINERO },
  { id: "margen_centimos", etiqueta: "Margen bruto", formato: "euros", mejorSiSube: true, flujo: true, roles: DINERO },
  { id: "solicitudes_nuevas", etiqueta: "Solicitudes nuevas", formato: "numero", mejorSiSube: true, flujo: true, roles: ["admin_samgple", "comercial_samgple"] },
  { id: "cola_certificacion", etiqueta: "En cola de certificación", formato: "numero", mejorSiSube: false, flujo: false, roles: ["admin_samgple", "revisor_samgple", "implantacion_samgple"] },
  { id: "alertas_abiertas", etiqueta: "Alertas abiertas", formato: "numero", mejorSiSube: false, flujo: false, roles: TODOS },
];

export type TipoAlerta = "sin_saldo" | "recarga_fallida" | "agente_suspendido" | "certificacion_atrasada" | "errores_repetidos" | "coste_ia_alto" | "error_sistema" | "meta_conexion";
const ROLES_ALERTA: Record<TipoAlerta, RolPlataforma[]> = {
  sin_saldo: ["admin_samgple", "finanzas_samgple", "soporte_samgple"],
  recarga_fallida: ["admin_samgple", "finanzas_samgple", "soporte_samgple"],
  agente_suspendido: ["admin_samgple", "revisor_samgple", "soporte_samgple"],
  certificacion_atrasada: ["admin_samgple", "revisor_samgple"],
  errores_repetidos: ["admin_samgple", "soporte_samgple"],
  coste_ia_alto: ["admin_samgple", "finanzas_samgple"],
  error_sistema: ["admin_samgple"],
  meta_conexion: ["admin_samgple", "soporte_samgple", "implantacion_samgple"],
};

export type TipoSuceso = "tarea_empieza" | "tarea_termina" | "traspaso" | "compra" | "alta" | "certificacion";
const ROLES_SUCESO: Record<TipoSuceso, RolPlataforma[]> = {
  tarea_empieza: TODOS, tarea_termina: TODOS, traspaso: TODOS, alta: TODOS, certificacion: TODOS, compra: DINERO,
};

export type Alerta = { tipo: TipoAlerta; urgencia: 2 | 3; empresaId: string | null; empresa: string | null; agente: string | null; desde: string; detalle: Record<string, unknown> };
export type Suceso = { cuando: string; tipo: TipoSuceso; empresaId: string; empresa: string; agente: string | null; agenteDestino: string | null; detalle: Record<string, unknown> };
export type Series = {
  semanas: { inicio: string; ventas_centimos: number; creditos_consumidos: number }[];
  meses: { inicio: string; nuevas_empresas: number; ingresos_centimos: number; coste_ia_centimos: number }[];
};

const puede = (roles: readonly RolPlataforma[], permitidos: readonly RolPlataforma[]) =>
  roles.includes("admin_samgple") || permitidos.some((r) => roles.includes(r));

/** Cambio USD → EUR para el coste de IA (el mismo que el panel de márgenes). */
export function cambioUsdPorEur(env: Record<string, string | undefined> = process.env): number {
  const n = Number(env.CAMBIO_USD_POR_EUR);
  return Number.isFinite(n) && n > 0 ? n : 1.08;
}

async function rpc<T>(db: SupabaseClient, fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await db.rpc(fn, args);
  if (error) throw new Error(`No se pudo calcular ${fn}: ${error.code ?? "error"}`);
  return data as T;
}

export async function indicadoresPanorama(db: SupabaseClient, roles: readonly RolPlataforma[], ahora = new Date()): Promise<Indicador[]> {
  const datos = await rpc<Record<IndicadorId, { actual: number; anterior: number }>>(db, "admin_panorama", { p_ahora: ahora.toISOString(), p_cambio: cambioUsdPorEur() });
  return INDICADORES.filter((i) => puede(roles, i.roles)).map((i) => ({
    id: i.id, etiqueta: i.etiqueta, formato: i.formato, mejorSiSube: i.mejorSiSube, flujo: i.flujo,
    actual: Number(datos[i.id]?.actual ?? 0), anterior: Number(datos[i.id]?.anterior ?? 0),
  }));
}

/** Las series solo tienen dinero y altas: las ve quien ve las cifras económicas. */
export async function seriesPanorama(db: SupabaseClient, roles: readonly RolPlataforma[], ahora = new Date()): Promise<Series | null> {
  if (!puede(roles, DINERO)) return null;
  return rpc<Series>(db, "admin_series", { p_ahora: ahora.toISOString(), p_cambio: cambioUsdPorEur() });
}

export async function sucesosEnDirecto(db: SupabaseClient, roles: readonly RolPlataforma[], opciones: { desde?: Date; limite?: number } = {}): Promise<Suceso[]> {
  const desde = opciones.desde ?? new Date(Date.now() - 7 * 24 * 3600_000);
  const filas = await rpc<{ cuando: string; tipo: TipoSuceso; empresa_id: string; empresa: string; agente: string | null; agente_destino: string | null; detalle: Record<string, unknown> }[]>(
    db, "admin_en_directo", { p_desde: desde.toISOString(), p_limite: opciones.limite ?? 80 },
  );
  return filas
    .filter((f) => puede(roles, ROLES_SUCESO[f.tipo] ?? ["admin_samgple"]))
    .map((f) => ({ cuando: f.cuando, tipo: f.tipo, empresaId: f.empresa_id, empresa: f.empresa, agente: f.agente, agenteDestino: f.agente_destino, detalle: f.detalle ?? {} }));
}

/** Alertas ordenadas por urgencia (y, dentro de la misma, la más antigua primero). */
export async function alertasAtencion(db: SupabaseClient, roles: readonly RolPlataforma[], ahora = new Date()): Promise<Alerta[]> {
  const filas = await rpc<{ tipo: string; urgencia: number; empresa_id: string | null; empresa: string | null; agente: string | null; desde: string; detalle: Record<string, unknown> }[]>(
    db, "admin_alertas", { p_ahora: ahora.toISOString(), p_cambio: cambioUsdPorEur() },
  );
  const plazos = leerPlazos();
  const alertas: Alerta[] = [];
  for (const f of filas) {
    let tipo = f.tipo as TipoAlerta;
    let urgencia = f.urgencia as 2 | 3;
    let detalle = f.detalle ?? {};
    if (f.tipo === "cola_certificacion") {
      // El plazo se cuenta en horas laborables (como en el panel de certificación).
      const espera = esperaDe(f.desde, String(detalle.via ?? "completa"), ahora, plazos);
      if (!espera.fueraDePlazo) continue;
      tipo = "certificacion_atrasada";
      urgencia = espera.horas > espera.plazo * 2 ? 3 : 2;
      detalle = { ...detalle, espera: espera.texto, plazoHoras: espera.plazo };
    }
    if (!(tipo in ROLES_ALERTA) || !puede(roles, ROLES_ALERTA[tipo])) continue;
    alertas.push({ tipo, urgencia, empresaId: f.empresa_id, empresa: f.empresa, agente: f.agente, desde: f.desde, detalle });
  }
  return alertas.sort((a, b) => b.urgencia - a.urgencia || a.desde.localeCompare(b.desde));
}

export const puedeVerFinanzas = (roles: readonly RolPlataforma[]) => puede(roles, DINERO);
