/**
 * Lo que un agente necesita para poder enviarse a certificación. Si falta algo, la empresa recibe la lista (no un «no» a secas).
 *  1 integraciones requeridas conectadas · 2 al menos una simulación hecha · 3 reglas completas · 4 aviso de IA configurado ·
 *  5 en agentes propios (sin plantilla), al menos 10 casos de prueba. SOLO SERVIDOR.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { integracionesFaltantes } from "../integraciones/faltantes.ts";
import { nombreDeProveedor } from "../integraciones/proveedores.ts";
import { UMBRALES } from "./umbrales.ts";

export type CodigoRequisito = "integraciones" | "simulacion" | "reglas" | "aviso_ia" | "casos_de_prueba";
export type Requisito = { codigo: CodigoRequisito; mensaje: string };

export type DatosRequisitos = {
  /** Nombres de las aplicaciones que el agente necesita y no están conectadas. */
  integracionesSinConectar: string[];
  simulaciones: number;
  reglas: { zona_horaria?: string | null; horario?: Record<string, unknown> | null; fuera_de_horario?: string | null; mensaje_fuera_horario?: string | null; idioma?: string | null; aviso_ia_texto?: string | null } | null;
  /** Sin plantilla IDESIE: la empresa aporta sus propios casos de prueba. */
  esPropio: boolean;
  casosPropios: number;
};

const vacio = (s: string | null | undefined) => !s || s.trim() === "";

/** Qué le falta a las reglas para estar completas (vacío = completas). */
export function reglasIncompletas(r: DatosRequisitos["reglas"]): string[] {
  if (!r) return ["no están configuradas"];
  const faltan: string[] = [];
  if (vacio(r.zona_horaria)) faltan.push("la zona horaria");
  const tramos = Object.values(r.horario ?? {}).filter((d) => Array.isArray(d) && d.length > 0).length;
  if (tramos === 0) faltan.push("el horario (al menos un tramo)");
  if (vacio(r.fuera_de_horario)) faltan.push("qué hacer fuera de horario");
  else if (r.fuera_de_horario === "responder_y_avisar" && vacio(r.mensaje_fuera_horario)) faltan.push("el mensaje de fuera de horario");
  if (vacio(r.idioma)) faltan.push("el idioma");
  return faltan;
}

/** Pura: la lista de lo que falta (vacía = se puede enviar). */
export function evaluarRequisitos(d: DatosRequisitos): Requisito[] {
  const faltan: Requisito[] = [];
  if (d.integracionesSinConectar.length) faltan.push({ codigo: "integraciones", mensaje: `Falta conectar ${d.integracionesSinConectar.join(", ")}.` });
  if (d.simulaciones < 1) faltan.push({ codigo: "simulacion", mensaje: "Prueba el agente en el simulador al menos una vez." });
  const reglas = reglasIncompletas(d.reglas);
  if (reglas.length) faltan.push({ codigo: "reglas", mensaje: `Completa las reglas del agente: ${reglas.join(", ")}.` });
  if (vacio(d.reglas?.aviso_ia_texto)) faltan.push({ codigo: "aviso_ia", mensaje: "Configura el aviso de IA (el texto con el que el agente dice que es una IA)." });
  if (d.esPropio && d.casosPropios < UMBRALES.minCasosBase) {
    faltan.push({ codigo: "casos_de_prueba", mensaje: `Un agente propio necesita al menos ${UMBRALES.minCasosBase} casos de prueba (hay ${d.casosPropios}).` });
  }
  return faltan;
}

/** Lee lo necesario y evalúa. null si el agente no es de esa empresa. */
export async function requisitosParaCertificar(db: SupabaseClient, companyId: string, agentId: string): Promise<Requisito[] | null> {
  const { data: a, error } = await db.from("agents").select("id, template_id, template_version").eq("company_id", companyId).eq("id", agentId).maybeSingle();
  if (error) throw new Error("No se pudo leer el agente.");
  if (!a) return null;
  const [porHerramientas, plantilla, conexiones, sims, reglas, casos] = await Promise.all([
    integracionesFaltantes(db, companyId, agentId),
    a.template_id && a.template_version
      ? db.from("agent_template_versions").select("integraciones_requeridas").eq("template_id", a.template_id).eq("version", a.template_version).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    db.from("company_connections").select("proveedor").eq("company_id", companyId).eq("estado", "conectado"),
    db.from("tasks").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("agent_id", agentId).eq("es_simulacion", true),
    db.from("agent_rules").select("zona_horaria, horario, fuera_de_horario, mensaje_fuera_horario, idioma, aviso_ia_texto").eq("company_id", companyId).eq("agent_id", agentId).maybeSingle(),
    db.from("agent_test_cases").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("agent_id", agentId),
  ]);
  for (const r of [plantilla, conexiones, sims, reglas, casos]) if (r.error) throw new Error("No se pudieron comprobar los requisitos de certificación.");
  const conectadas = new Set((conexiones.data ?? []).map((c) => c.proveedor as string));
  const sinConectar = new Set((porHerramientas ?? []).map((f) => f.nombre));
  for (const p of ((plantilla.data?.integraciones_requeridas as string[] | null) ?? [])) if (!conectadas.has(p)) sinConectar.add(nombreDeProveedor(p));
  return evaluarRequisitos({
    integracionesSinConectar: [...sinConectar].sort((x, y) => x.localeCompare(y)),
    simulaciones: sims.count ?? 0,
    reglas: (reglas.data as DatosRequisitos["reglas"]) ?? null,
    esPropio: !a.template_id,
    casosPropios: casos.count ?? 0,
  });
}
