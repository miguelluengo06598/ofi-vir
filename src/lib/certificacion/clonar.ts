/**
 * Prepara la empresa FICTICIA de examen y una copia del agente (con la configuración de la versión enviada) dentro de ella.
 * El examen nunca toca la empresa real: ni su memoria, ni su conocimiento, ni su CRM. Solo servidor.
 */
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { crearFuenteJson } from "../conocimiento/servicio.ts";
import { SupabaseAlmacenConocimiento } from "../conocimiento/supabaseAlmacen.ts";
import type { MemoryService } from "../memory/service.ts";
import { CONOCIMIENTO_EXAMEN, EMPRESA_EXAMEN_ID, EMPRESA_EXAMEN_NOMBRE, PREFIJO_CONOCIMIENTO } from "./datosFicticios.ts";

/** Lo que guarda `agent_versions.snapshot` (nunca las instrucciones base de la plantilla). */
export type ConfigVersion = {
  ficha: { nombre: string; rol: string; template_id: string | null; modelo: string; negocio_resumen: string; tono: string; objetivo: string; nunca_hace: string; instrucciones_empresa: string };
  herramientas: { tool_id: string; permiso: "sola" | "aprobacion" | "humano" | "prohibida"; limite_diario: number | null }[];
  reglas: { zona_horaria: string; horario: Record<string, unknown>; fuera_de_horario: string; mensaje_fuera_horario: string | null; max_mensajes_dia: number | null; tope_creditos_mes: number | null; aviso_ia_texto: string | null; idioma: string } | null;
  traspasos: { agent_id_destino: string; condicion: string; tipo_traspaso: string; activo: boolean }[];
  /** Versión de la plantilla IDESIE con la que trabaja esta versión del agente (las fotos antiguas no la tienen). */
  plantilla_version?: number | null;
  /** Correcciones aprendidas que forman parte de esta versión (las fotos antiguas no las tienen). */
  correcciones?: { id: string; regla: string }[];
};

export type AgenteAExaminar = { companyId: string; agentId: string; version: number; config: ConfigVersion; instructions: string; templateId: string | null };

/** La configuración de la versión enviada: su foto en `agent_versions` o, si es la actual y aún no tiene foto, la de ahora. */
export async function cargarConfiguracion(db: SupabaseClient, companyId: string, agentId: string, version: number): Promise<AgenteAExaminar> {
  const { data: a, error } = await db.from("agents").select("version_actual, instructions, template_id").eq("company_id", companyId).eq("id", agentId).maybeSingle();
  if (error || !a) throw new Error("Agente no encontrado.");
  // La foto de la versión; si es la actual y aún no tenía, la base la guarda (las tablas vivas son esa versión).
  const r = await db.rpc("_agent_version_snapshot", { p_company_id: companyId, p_agent_id: agentId, p_version: version });
  if (r.error || !r.data) throw new Error(r.error?.code === "P0002" ? `No hay copia de la versión ${version} del agente.` : "No se pudo leer la configuración del agente.");
  const snapshot = r.data as ConfigVersion;
  return { companyId, agentId, version, config: snapshot, instructions: (a.instructions as string) ?? "", templateId: (a.template_id as string | null) ?? snapshot.ficha.template_id };
}

export type EmpresaDeExamen = { companyId: string; agentId: string; slug: string };

/**
 * Asegura la empresa de examen y el conocimiento ficticio (una sola vez) y crea la copia del agente con sus herramientas, reglas y traspasos.
 * Los destinos de traspaso son agentes «de relleno» con el mismo nombre (sin herramientas).
 */
export async function prepararEmpresaDeExamen(
  db: SupabaseClient, memoria: MemoryService, origen: AgenteAExaminar, requestId: string, registrarError: (m: string, e: unknown) => void = () => {},
  opciones: { modelo?: string | null } = {},
): Promise<EmpresaDeExamen> {
  const companyId = EMPRESA_EXAMEN_ID;
  const { error: e0 } = await db.from("companies").upsert({ id: companyId, name: EMPRESA_EXAMEN_NOMBRE, es_examen: true }, { onConflict: "id" });
  if (e0) throw new Error(`No se pudo preparar la empresa de examen: ${e0.message}`);
  let { data: dep } = await db.from("departments").select("id").eq("company_id", companyId).eq("slug", "examen").maybeSingle();
  if (!dep) {
    const r = await db.from("departments").insert({ company_id: companyId, slug: "examen", name: "Examen" }).select("id").single();
    if (r.error) throw new Error(`No se pudo crear el departamento de examen: ${r.error.message}`);
    dep = r.data;
  }
  const departmentId = dep!.id as string;

  // Conocimiento ficticio (idempotente).
  const almacen = new SupabaseAlmacenConocimiento(db);
  const existentes = new Set((await almacen.listar(companyId)).map((f) => f.titulo));
  const trabajos: Promise<void>[] = [];
  for (const f of CONOCIMIENTO_EXAMEN.filter((f) => !existentes.has(f.titulo))) {
    await crearFuenteJson({ almacen, memoria, descargar: async () => { throw new Error("sin red en el examen"); }, enSegundoPlano: (p) => void trabajos.push(p), registrarError },
      { companyId, userId: null as unknown as string }, { tipo: "texto", titulo: f.titulo, texto: f.texto, agenteId: null } as never);
  }
  await Promise.all(trabajos);
  if (CONOCIMIENTO_EXAMEN.some((f) => !existentes.has(f.titulo))) {
    const listas = (await almacen.listar(companyId)).filter((f) => f.titulo.startsWith(PREFIJO_CONOCIMIENTO) && f.estado !== "listo");
    if (listas.length) throw new Error("No se pudo procesar el conocimiento ficticio del examen.");
  }

  // Copia del agente.
  const corto = requestId.replace(/-/g, "").slice(0, 8);
  const f = origen.config.ficha;
  const agentId = randomUUID();
  const slug = `ex-${corto}-agente`;
  const ins = await db.from("agents").insert({
    id: agentId, company_id: companyId, department_id: departmentId, slug, name: f.nombre, role: f.rol, creator_name: "IDESIE", model: opciones.modelo || f.modelo,
    template_id: f.template_id, ...(f.template_id && origen.config.plantilla_version ? { template_version: origen.config.plantilla_version } : {}), negocio_resumen: f.negocio_resumen, tono: f.tono, objetivo: f.objetivo, nunca_hace: f.nunca_hace,
    instrucciones_empresa: f.instrucciones_empresa, instructions: origen.instructions, version_actual: origen.version,
  });
  if (ins.error) throw new Error(`No se pudo crear la copia del agente para el examen: ${ins.error.message}`);

  const tools = origen.config.herramientas.map((t) => ({ agent_id: agentId, company_id: companyId, tool_id: t.tool_id, permiso: t.permiso, limite_diario: t.limite_diario }));
  if (tools.length) {
    const r = await db.from("agent_tools").insert(tools);
    if (r.error) throw new Error(`No se pudieron copiar las herramientas: ${r.error.message}`);
  }
  if (origen.config.reglas) {
    const r = await db.from("agent_rules").insert({ ...origen.config.reglas, agent_id: agentId, company_id: companyId });
    if (r.error) throw new Error(`No se pudieron copiar las reglas: ${r.error.message}`);
  }
  // Las correcciones aprendidas de la versión enviada también se examinan (van en sus instrucciones).
  const correcciones = (origen.config.correcciones ?? []).filter((c) => c.regla?.trim());
  if (correcciones.length) {
    const r = await db.from("agent_corrections").insert(correcciones.map((c) => ({ company_id: companyId, agent_id: agentId, contexto: "examen", respuesta_original: "-", respuesta_corregida: "-", regla_aprendida: c.regla, activa: true, estado: "activa" })));
    if (r.error) throw new Error(`No se pudieron copiar las correcciones: ${r.error.message}`);
  }
  for (const [i, t] of origen.config.traspasos.entries()) {
    const { data: destino } = await db.from("agents").select("name, role").eq("company_id", origen.companyId).eq("id", t.agent_id_destino).maybeSingle();
    const stubId = randomUUID();
    const s = await db.from("agents").insert({ id: stubId, company_id: companyId, department_id: departmentId, slug: `ex-${corto}-destino-${i}`, name: destino?.name ?? `Destino ${i + 1}`, role: destino?.role ?? "Destino de traspaso", creator_name: "IDESIE" });
    if (s.error) throw new Error(`No se pudo crear un destino de traspaso de relleno: ${s.error.message}`);
    const h = await db.from("agent_handoffs").insert({ company_id: companyId, agent_id_origen: agentId, agent_id_destino: stubId, condicion: t.condicion, tipo_traspaso: t.tipo_traspaso, activo: t.activo });
    if (h.error) throw new Error(`No se pudo copiar un traspaso: ${h.error.message}`);
  }
  return { companyId, agentId, slug };
}

/** Archiva las copias de este examen (la empresa de examen no es de nadie: no hay que borrar nada para que no vuelvan a ejecutarse). */
export async function archivarCopias(db: SupabaseClient, requestId: string): Promise<void> {
  const corto = requestId.replace(/-/g, "").slice(0, 8);
  await db.from("agents").update({ estado: "archivado" }).eq("company_id", EMPRESA_EXAMEN_ID).like("slug", `ex-${corto}-%`);
}
