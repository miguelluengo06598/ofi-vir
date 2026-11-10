import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Horario, FueraDeHorario, ReglasAgente } from "../instrucciones.ts";
import type { AlmacenReglas, TipoAvisoRegla } from "./tipos.ts";

/** Almacén en memoria para los tests (misma forma que el de Supabase). */
export class InMemoryAlmacenReglas implements AlmacenReglas {
  reglas = new Map<string, ReglasAgente>();
  consumo: { companyId: string; agentId: string; creditos: number; fecha: Date }[] = [];
  avisos: { companyId: string; agentId: string; tipo: TipoAvisoRegla; titulo: string; cuerpo: string; creado: Date }[] = [];
  /** El reloj de los avisos (para simular días y meses). */
  ahora: () => Date = () => new Date();

  async reglasDe(_c: string, agentId: string) { return this.reglas.get(agentId) ?? null; }
  async creditosConsumidosDesde(companyId: string, agentId: string, desde: Date) {
    return this.consumo.filter((x) => x.companyId === companyId && x.agentId === agentId && x.fecha >= desde).reduce((s, x) => s + x.creditos, 0);
  }
  async avisarEmpresa(companyId: string, a: { agentId: string; tipo: TipoAvisoRegla; titulo: string; cuerpo: string; desde: Date }) {
    if (this.avisos.some((n) => n.companyId === companyId && n.agentId === a.agentId && n.tipo === a.tipo && n.creado >= a.desde)) return false;
    this.avisos.push({ companyId, agentId: a.agentId, tipo: a.tipo, titulo: a.titulo, cuerpo: a.cuerpo, creado: this.ahora() });
    return true;
  }
}

/** Almacén sobre Supabase con la clave de servicio (solo servidor). */
export class SupabaseAlmacenReglas implements AlmacenReglas {
  private readonly db: SupabaseClient;
  constructor(db: SupabaseClient) { this.db = db; }

  static fromEnv(): SupabaseAlmacenReglas | null {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim(), key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
    return url && key ? new SupabaseAlmacenReglas(createClient(url, key, { auth: { persistSession: false } })) : null;
  }

  async reglasDe(companyId: string, agentId: string): Promise<ReglasAgente | null> {
    const { data: r, error } = await this.db.from("agent_rules").select("*").eq("company_id", companyId).eq("agent_id", agentId).maybeSingle();
    if (error) throw new Error("No se pudieron leer las reglas del agente.");
    if (!r) return null;
    return {
      zonaHoraria: r.zona_horaria as string, horario: (r.horario ?? {}) as Horario, fueraDeHorario: r.fuera_de_horario as FueraDeHorario,
      mensajeFueraHorario: (r.mensaje_fuera_horario as string | null) ?? null, maxMensajesDia: (r.max_mensajes_dia as number | null) ?? null,
      topeCreditosMes: (r.tope_creditos_mes as number | null) ?? null, avisoIaTexto: (r.aviso_ia_texto as string | null) ?? null, idioma: r.idioma as string,
    };
  }

  async creditosConsumidosDesde(companyId: string, agentId: string, desde: Date) {
    const { data, error } = await this.db.rpc("agent_creditos_consumidos", { p_company_id: companyId, p_agent_id: agentId, p_desde: desde.toISOString() });
    if (error) throw new Error("No se pudo leer el consumo del agente.");
    return Number(data ?? 0);
  }

  async avisarEmpresa(companyId: string, a: { agentId: string; tipo: TipoAvisoRegla; titulo: string; cuerpo: string; desde: Date }) {
    const { data, error } = await this.db.rpc("aviso_regla_agente", {
      p_company_id: companyId, p_agent_id: a.agentId, p_tipo: a.tipo, p_titulo: a.titulo, p_cuerpo: a.cuerpo, p_desde: a.desde.toISOString(),
    });
    if (error) throw new Error("No se pudo avisar a la empresa.");
    return Boolean(data);
  }
}
