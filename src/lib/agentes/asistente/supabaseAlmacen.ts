import type { SupabaseClient } from "@supabase/supabase-js";
import { REGISTRO, obtenerHerramienta } from "../herramientas/registro.ts";
import type { Permiso } from "../herramientas/tipos.ts";
import type { MensajeSesion, Propuesta } from "./esquemas.ts";
import type { AlmacenAsistente, CambiosAplicar, ContextoAgente, CosteAsistente, ResultadoAplicar, SesionAsistente } from "./tipos.ts";

const HORARIO_POR_DEFECTO = { lun: [["09:00", "18:00"]], mar: [["09:00", "18:00"]], mie: [["09:00", "18:00"]], jue: [["09:00", "18:00"]], vie: [["09:00", "18:00"]] };

/**
 * Acceso del asistente a la base con la clave de servicio (solo servidor). Se salta la RLS, así que CADA consulta filtra por
 * `company_id`. De las plantillas solo lee las columnas públicas: las instrucciones protegidas no se piden nunca.
 */
export class SupabaseAlmacenAsistente implements AlmacenAsistente {
  private readonly db: SupabaseClient;
  constructor(db: SupabaseClient) {
    this.db = db;
  }

  async cargarContexto(companyId: string, agentId: string): Promise<ContextoAgente | null> {
    const { data: a, error } = await this.db.from("agents")
      .select("id, company_id, department_id, name, role, estado, version_actual, template_id, negocio_resumen, tono, objetivo, nunca_hace, instrucciones_empresa")
      .eq("company_id", companyId).eq("id", agentId).maybeSingle();
    if (error) throw new Error("No se pudo leer el agente.");
    if (!a) return null;

    const [plantilla, tools, reglas, agentes, deps, traspasos, conocimiento] = await Promise.all([
      a.template_id
        ? this.db.from("agent_templates").select("id, nombre_por_defecto, descripcion_publica, que_hace, que_no_hace, herramientas_disponibles").eq("id", a.template_id as string).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      this.db.from("agent_tools").select("tool_id, permiso").eq("company_id", companyId).eq("agent_id", agentId),
      this.db.from("agent_rules").select("zona_horaria, horario, fuera_de_horario, mensaje_fuera_horario, idioma").eq("company_id", companyId).eq("agent_id", agentId).maybeSingle(),
      this.db.from("agents").select("id, name, role, department_id, estado").eq("company_id", companyId),
      this.db.from("departments").select("id, name").eq("company_id", companyId),
      this.db.from("agent_handoffs").select("agent_id_destino, condicion, tipo_traspaso").eq("company_id", companyId).eq("agent_id_origen", agentId).eq("activo", true),
      this.db.from("agent_knowledge").select("titulo, tipo, estado").eq("company_id", companyId).or(`agent_id.is.null,agent_id.eq.${agentId}`).limit(30),
    ]);
    for (const r of [plantilla, tools, reglas, agentes, deps, traspasos, conocimiento]) if (r.error) throw new Error("No se pudo leer la configuración del agente.");

    const actual = new Map((tools.data ?? []).map((t) => [t.tool_id as string, t.permiso as Permiso]));
    const tpl = plantilla.data as { id: string; nombre_por_defecto: string; descripcion_publica: string; que_hace: string; que_no_hace: string; herramientas_disponibles: { id: string; permiso_defecto: Permiso; editable: boolean }[] } | null;

    const herramientas: ContextoAgente["herramientas"] = [];
    if (tpl) {
      for (const t of tpl.herramientas_disponibles) {
        const h = obtenerHerramienta(t.id);
        if (!h) continue;   // una herramienta de la plantilla que ya no existe en el catálogo: no se ofrece
        herramientas.push({ id: h.id, nombre: h.nombre, descripcion: h.descripcionEmpresa, sensibilidad: h.sensibilidad, integracion: h.integracion, permisoDefecto: t.permiso_defecto, editable: t.editable, permisoActual: actual.get(h.id) ?? null });
      }
    } else {
      for (const h of REGISTRO) {
        herramientas.push({ id: h.id, nombre: h.nombre, descripcion: h.descripcionEmpresa, sensibilidad: h.sensibilidad, integracion: h.integracion, permisoDefecto: h.permisoDefecto, editable: true, permisoActual: actual.get(h.id) ?? null });
      }
    }

    const nombreDep = new Map((deps.data ?? []).map((d) => [d.id as string, d.name as string]));
    const todos = (agentes.data ?? []) as { id: string; name: string; role: string; department_id: string; estado: string }[];
    const porId = new Map(todos.map((x) => [x.id, x]));
    const r = reglas.data as { zona_horaria: string; horario: Record<string, string[][]>; fuera_de_horario: string; mensaje_fuera_horario: string | null; idioma: string } | null;

    return {
      agente: {
        id: a.id as string, companyId, departmentId: a.department_id as string, nombre: a.name as string, rol: a.role as string, estado: a.estado as string,
        versionActual: a.version_actual as number, templateId: (a.template_id as string | null) ?? null,
        negocioResumen: a.negocio_resumen as string, tono: a.tono as string, objetivo: a.objetivo as string, nuncaHace: a.nunca_hace as string, instruccionesEmpresa: a.instrucciones_empresa as string,
      },
      plantilla: tpl ? { id: tpl.id, nombre: tpl.nombre_por_defecto, descripcionPublica: tpl.descripcion_publica, queHace: tpl.que_hace, queNoHace: tpl.que_no_hace } : null,
      herramientas,
      reglas: r
        ? { zonaHoraria: r.zona_horaria, horario: r.horario, fueraDeHorario: r.fuera_de_horario, mensajeFueraHorario: r.mensaje_fuera_horario, idioma: r.idioma }
        : { zonaHoraria: "Europe/Madrid", horario: HORARIO_POR_DEFECTO, fueraDeHorario: "responder_y_avisar", mensajeFueraHorario: null, idioma: "es" },
      otrosAgentes: todos.filter((x) => x.id !== agentId && x.estado !== "archivado").map((x) => ({ id: x.id, nombre: x.name, rol: x.role, departamento: nombreDep.get(x.department_id) ?? "" })),
      traspasosActuales: (traspasos.data ?? []).map((t) => ({
        destinoId: t.agent_id_destino as string, destinoNombre: porId.get(t.agent_id_destino as string)?.name ?? "", condicion: t.condicion as string, tipo: t.tipo_traspaso as string,
      })),
      conocimiento: (conocimiento.data ?? []).map((k) => ({ titulo: k.titulo as string, tipo: k.tipo as string, estado: k.estado as string })),
    };
  }

  async cargarSesion(companyId: string, agentId: string, sesionId: string): Promise<SesionAsistente | null> {
    const { data, error } = await this.db.from("agent_setup_sessions").select("id, company_id, agent_id, mensajes, propuesta_actual, version_base, estado")
      .eq("company_id", companyId).eq("agent_id", agentId).eq("id", sesionId).maybeSingle();
    if (error) throw new Error("No se pudo leer la conversación.");
    if (!data) return null;
    return { id: data.id as string, companyId, agentId, mensajes: (data.mensajes as MensajeSesion[]) ?? [], propuestaActual: data.propuesta_actual ?? null, versionBase: data.version_base as number, estado: data.estado as "abierta" | "aplicada" };
  }

  async guardarSesion(s: { id?: string; companyId: string; agentId: string; userId: string; mensajes: MensajeSesion[]; propuesta: Propuesta; versionBase: number }): Promise<string> {
    if (s.id) {
      const { data, error } = await this.db.from("agent_setup_sessions").update({ mensajes: s.mensajes, propuesta_actual: s.propuesta, version_base: s.versionBase })
        .eq("company_id", s.companyId).eq("agent_id", s.agentId).eq("id", s.id).eq("estado", "abierta").select("id");
      if (error || !data?.length) throw new Error("No se pudo actualizar la conversación.");
      return s.id;
    }
    const { data, error } = await this.db.from("agent_setup_sessions")
      .insert({ company_id: s.companyId, agent_id: s.agentId, mensajes: s.mensajes, propuesta_actual: s.propuesta, version_base: s.versionBase, created_by: s.userId }).select("id").single();
    if (error || !data) throw new Error("No se pudo guardar la conversación.");
    return data.id as string;
  }

  async registrarCoste(c: CosteAsistente): Promise<void> {
    const { error } = await this.db.from("task_costs").upsert({
      task_id: c.taskId, company_id: c.companyId, agent_id: c.agentId, modelo: c.modelo,
      tokens_entrada: c.uso.inputTokens + c.uso.cacheWriteTokens, tokens_salida: c.uso.outputTokens, tokens_cache: c.uso.cacheReadTokens,
      coste_ia_usd_micros: c.costeIaUsdMicros, creditos_cobrados: c.creditosCobrados, tipo_tarea: "experta",
    }, { onConflict: "task_id" });
    if (error) throw new Error(`No se pudo registrar el coste: ${error.message}`);
  }

  async aplicar(p: { companyId: string; agentId: string; userId: string; sesionId: string; versionEsperada: number; cambios: CambiosAplicar; motivo: string }): Promise<ResultadoAplicar> {
    const { data, error } = await this.db.rpc("agent_aplicar_configuracion", {
      p_company_id: p.companyId, p_agent_id: p.agentId, p_user_id: p.userId, p_session_id: p.sesionId, p_version_esperada: p.versionEsperada, p_cambios: p.cambios, p_motivo: p.motivo,
    });
    if (error) throw new Error(error.message);
    const fila = (Array.isArray(data) ? data[0] : data) as { version: number; permisos_aplicados: number; traspasos_creados: number } | undefined;
    if (!fila) throw new Error("La base no devolvió la versión nueva.");
    return { version: fila.version, permisosAplicados: fila.permisos_aplicados, traspasosCreados: fila.traspasos_creados };
  }
}
