/**
 * La oficina tal como está en la base de datos, para la interfaz. SOLO SERVIDOR.
 * Nada inventado: agentes, en qué están, aprobaciones que esperan, créditos de hoy y métricas de cada departamento salen
 * de las tablas de la empresa de la sesión. Si algo no existe todavía, la vista lo dice (nunca se rellena con ejemplos).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AgentStatus, DepartmentId } from "@/components/glass/tokens";
import type { Agent } from "@/data/agents";
import { REGISTRO } from "@/lib/agentes/herramientas/registro";

import { SIN_TRABAJO, type MetricaDepartamento, type OficinaReal } from "./oficinaReal";

const DEPARTAMENTOS: DepartmentId[] = ["ventas", "atencion", "marketing", "operaciones", "direccion"];
const NOMBRE_HERRAMIENTA = new Map(REGISTRO.map((h) => [h.id, h.nombre]));

/** En qué está un agente que no está trabajando ahora mismo, según su ciclo de vida. */
const FRASE_ESTADO: Record<string, string> = {
  borrador: "en preparación: falta configurarlo",
  en_pruebas: "en pruebas en el simulador",
  en_certificacion: "en certificación: aún no atiende a nadie",
  certificado: "certificado: falta activarlo",
  activo: SIN_TRABAJO,
  pausado: "en pausa",
  rechazado: "rechazado en la certificación: hay que corregirlo",
  suspendido: "suspendido por MyOfia",
};

export async function cargarOficinaReal(db: SupabaseClient, companyId: string, usuario: string, ahora = new Date()): Promise<OficinaReal> {
  const inicioDia = new Date(ahora);
  inicioDia.setHours(0, 0, 0, 0);
  const desdeSemana = new Date(ahora.getTime() - 7 * 24 * 3600_000).toISOString();

  const [ag, herr, enCurso, aprob, segu, consumo, hechas, leads, opiniones] = await Promise.all([
    db.from("agents").select("id, slug, name, role, estado, creator_name, departments!inner(tipo)").eq("company_id", companyId).neq("estado", "archivado").order("name"),
    db.from("agent_tools").select("agent_id, tool_id, permiso").eq("company_id", companyId).neq("permiso", "prohibida"),
    db.from("tasks").select("agent_id, title, status, created_at").eq("company_id", companyId).eq("es_simulacion", false).in("status", ["running", "approval", "expert"]).order("created_at", { ascending: false }),
    db.from("approvals").select("agent_id").eq("company_id", companyId).eq("status", "pending"),
    db.from("agent_followups").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("estado", "propuesto"),
    db.from("credit_ledger").select("agent_id, creditos").eq("company_id", companyId).eq("tipo", "consumo").gte("creado_en", inicioDia.toISOString()),
    db.from("tasks").select("agent_id").eq("company_id", companyId).eq("es_simulacion", false).eq("status", "done").gte("created_at", desdeSemana),
    db.from("contacts").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("origen", "Meta Lead Ads").gte("created_at", desdeSemana),
    db.from("agent_feedback").select("agent_id, value").eq("company_id", companyId).gte("created_at", new Date(ahora.getTime() - 90 * 24 * 3600_000).toISOString()),
  ]);
  if (ag.error) throw new Error("No se pudieron leer los agentes de la oficina.");

  // Por id interno; la interfaz los recibe por slug (cómo identifica a los agentes).
  const porId: Record<string, number> = {};
  for (const a of aprob.data ?? []) porId[a.agent_id as string] = (porId[a.agent_id as string] ?? 0) + 1;
  const pendientesPorAgente: Record<string, number> = {};
  const creditosHoy: Record<string, number> = {};
  for (const m of consumo.data ?? []) if (m.agent_id) creditosHoy[m.agent_id as string] = (creditosHoy[m.agent_id as string] ?? 0) + Math.abs(m.creditos as number);

  const agentes: Agent[] = ((ag.data ?? []) as unknown as { id: string; slug: string; name: string; role: string; estado: string; creator_name: string; departments: { tipo: DepartmentId } }[]).map((a) => {
    const tarea = (enCurso.data ?? []).find((t) => t.agent_id === a.id);
    const pendientes = porId[a.id] ?? 0;
    const id = a.slug || a.id;
    if (pendientes) pendientesPorAgente[id] = pendientes;
    let status: AgentStatus;
    let task: string;
    if (a.estado === "activo" && tarea && tarea.status === "running") { status = "working"; task = `con «${String(tarea.title).slice(0, 90)}»`; }
    else if (a.estado === "activo" && pendientes > 0) { status = "waiting"; task = `esperando tu aprobación (${pendientes})`; }
    else if (a.estado === "activo") { status = "working"; task = FRASE_ESTADO.activo; }
    else { status = a.estado === "suspendido" || a.estado === "rechazado" ? "error" : "paused"; task = FRASE_ESTADO[a.estado] ?? a.estado; }
    return {
      id, name: a.name, role: a.role, departmentId: a.departments.tipo, status, task,
      tools: (herr.data ?? []).filter((h) => h.agent_id === a.id).map((h) => NOMBRE_HERRAMIENTA.get(h.tool_id as string) ?? (h.tool_id as string)),
      creator: a.creator_name || "MyOfia", creditsToday: creditosHoy[a.id] ?? 0,
    };
  });

  // Métricas reales por departamento (últimos 7 días): tareas terminadas y, en Ventas, leads de Facebook.
  const depDeAgente = new Map(((ag.data ?? []) as unknown as { id: string; departments: { tipo: DepartmentId } }[]).map((a) => [a.id, a.departments.tipo]));
  const hechasPorDep: Record<string, number> = {};
  for (const t of hechas.data ?? []) {
    const tipo = depDeAgente.get(t.agent_id as string);
    if (tipo) hechasPorDep[tipo] = (hechasPorDep[tipo] ?? 0) + 1;
  }
  const metricas = Object.fromEntries(DEPARTAMENTOS.map((d) => {
    const lista: MetricaDepartamento[] = [{ label: "Tareas terminadas (7 días)", value: String(hechasPorDep[d] ?? 0) }];
    if (d === "ventas") lista.push({ label: "Leads de Facebook (7 días)", value: String(leads.count ?? 0) });
    return [d, lista];
  })) as Record<DepartmentId, MetricaDepartamento[]>;

  // Estadísticas de cada agente (por slug, como lo identifica la interfaz).
  const slugDe = new Map(((ag.data ?? []) as unknown as { id: string; slug: string }[]).map((a) => [a.id, a.slug || a.id]));
  const estadisticas: OficinaReal["estadisticas"] = {};
  const de = (id: string) => (estadisticas[slugDe.get(id) ?? id] ??= { tareasSemana: 0, positivas: null, valoraciones: 0 });
  for (const t of hechas.data ?? []) if (slugDe.has(t.agent_id as string)) de(t.agent_id as string).tareasSemana++;
  const buenas: Record<string, number> = {};
  for (const f of opiniones.data ?? []) {
    if (!slugDe.has(f.agent_id as string)) continue;
    const e = de(f.agent_id as string);
    e.valoraciones++;
    if (Number(f.value) > 0) buenas[f.agent_id as string] = (buenas[f.agent_id as string] ?? 0) + 1;
  }
  for (const [id, s] of slugDe) if (estadisticas[s]?.valoraciones) estadisticas[s].positivas = Math.round(((buenas[id] ?? 0) / estadisticas[s].valoraciones) * 100);

  return { usuario, agentes, pendientesPorAgente, estadisticas, pendientes: (aprob.data?.length ?? 0) + (segu.count ?? 0), metricas };
}
