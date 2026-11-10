import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { AgenteCargado, FueraDeHorario, FuenteInstrucciones, Horario } from "./instrucciones.ts";
import { LIMITES_PARTES } from "./instrucciones.ts";


const REGLAS_POR_DEFECTO = {
  zonaHoraria: "Europe/Madrid",
  horario: { lun: [["09:00", "18:00"]], mar: [["09:00", "18:00"]], mie: [["09:00", "18:00"]], jue: [["09:00", "18:00"]], vie: [["09:00", "18:00"]] } as Horario,
  fueraDeHorario: "responder_y_avisar" as FueraDeHorario,
};

/**
 * Lee la configuración de un agente con la clave de servicio (solo servidor): es la ÚNICA vía por la que `instrucciones_base`
 * de una plantilla sale de la base. Cada consulta filtra por `company_id` a mano (la clave de servicio se salta la RLS).
 */
export class SupabaseFuenteInstrucciones implements FuenteInstrucciones {
  private readonly db: SupabaseClient;
  constructor(db: SupabaseClient) {
    this.db = db;
  }

  static fromEnv(): SupabaseFuenteInstrucciones | null {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
    return url && key ? new SupabaseFuenteInstrucciones(createClient(url, key, { auth: { persistSession: false } })) : null;
  }

  private async plantillaDe(id: string, version: number | null) {
    if (version !== null) {
      const v = await this.db.from("agent_template_versions").select("template_id, version, instrucciones_base").eq("template_id", id).eq("version", version).maybeSingle();
      if (v.error) return { data: null, error: v.error };
      if (v.data) return { data: { id: v.data.template_id as string, version: v.data.version as number, instrucciones_base: v.data.instrucciones_base as string }, error: null };
    }
    return this.db.from("agent_templates").select("id, version, instrucciones_base").eq("id", id).maybeSingle();
  }

  async cargar(companyId: string, agentId: string): Promise<AgenteCargado | null> {
    const { data: a, error } = await this.db.from("agents")
      .select("id, name, role, tono, objetivo, nunca_hace, instrucciones_empresa, instructions, negocio_resumen, template_id, template_version, estado, version_actual, version_certificada")
      .eq("company_id", companyId).eq("id", agentId).maybeSingle();
    if (error) throw new Error("No se pudo leer el agente.");
    if (!a) return null;

    const [plantilla, reglas, traspasos, correcciones] = await Promise.all([
      // La plantilla, en la versión con la que trabaja el agente: si IDESIE publica otra, el agente no cambia solo.
      a.template_id
        ? this.plantillaDe(a.template_id as string, (a.template_version as number | null) ?? null)
        : Promise.resolve({ data: null, error: null }),
      this.db.from("agent_rules").select("*").eq("company_id", companyId).eq("agent_id", agentId).maybeSingle(),
      this.db.from("agent_handoffs").select("agent_id_destino, condicion, tipo_traspaso").eq("company_id", companyId).eq("agent_id_origen", agentId).eq("activo", true),
      this.db.from("agent_corrections").select("regla_aprendida").eq("company_id", companyId).eq("agent_id", agentId).eq("activa", true).not("regla_aprendida", "is", null)
        .order("creado_en", { ascending: false }).limit(LIMITES_PARTES.maxCorrecciones),
    ]);
    for (const r of [plantilla, reglas, traspasos, correcciones]) if (r.error) throw new Error("No se pudo leer la configuración del agente.");

    let nombres = new Map<string, string>();
    if (traspasos.data?.length) {
      const { data: ags, error: e2 } = await this.db.from("agents").select("id, name").eq("company_id", companyId).in("id", traspasos.data.map((t) => t.agent_id_destino as string));
      if (e2) throw new Error("No se pudieron leer los agentes de destino.");
      nombres = new Map((ags ?? []).map((x) => [x.id as string, x.name as string]));
    }

    const r = reglas.data;
    // Mientras existan agentes con las instrucciones antiguas (agents.instructions) y sin plantilla, se usan como instrucciones de la empresa.
    const propias = ((a.instrucciones_empresa as string) || (!a.template_id ? (a.instructions as string) : "") || "").toString();
    return {
      estado: a.estado as string,
      versionActual: a.version_actual as number,
      versionCertificada: (a.version_certificada as number | null) ?? null,
      plantilla: plantilla.data ? { id: plantilla.data.id as string, version: plantilla.data.version as number, instruccionesBase: plantilla.data.instrucciones_base as string } : null,
      config: {
        agente: {
          nombre: a.name as string, rol: a.role as string, tono: (a.tono as string) ?? "", objetivo: (a.objetivo as string) ?? "",
          nuncaHace: (a.nunca_hace as string) ?? "", instruccionesEmpresa: propias, negocioResumen: (a.negocio_resumen as string) ?? "",
        },
        reglas: r
          ? {
              zonaHoraria: r.zona_horaria as string, horario: (r.horario ?? {}) as Horario, fueraDeHorario: r.fuera_de_horario as FueraDeHorario,
              mensajeFueraHorario: (r.mensaje_fuera_horario as string | null) ?? null, maxMensajesDia: (r.max_mensajes_dia as number | null) ?? null,
              topeCreditosMes: (r.tope_creditos_mes as number | null) ?? null, avisoIaTexto: (r.aviso_ia_texto as string | null) ?? null, idioma: r.idioma as string,
            }
          : { ...REGLAS_POR_DEFECTO, mensajeFueraHorario: null, maxMensajesDia: null, topeCreditosMes: null, avisoIaTexto: null, idioma: "auto" },
        traspasos: (traspasos.data ?? []).flatMap((t) => {
          const nombre = nombres.get(t.agent_id_destino as string);
          return nombre ? [{ destinoNombre: nombre, condicion: t.condicion as string, tipo: t.tipo_traspaso as string }] : [];
        }),
        correcciones: (correcciones.data ?? []).map((c) => c.regla_aprendida as string),
      },
    };
  }
}
