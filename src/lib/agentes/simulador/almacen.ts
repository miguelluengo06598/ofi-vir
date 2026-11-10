/** Lo que el simulador necesita de la base, aparte del motor: cuota de simulaciones, `task_costs` y la plantilla del agente. */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AlmacenHerramientas } from "../herramientas/tipos.ts";

export type CosteSimulacion = {
  taskId: string; companyId: string; agentId: string; modelo: string;
  tokensEntrada: number; tokensSalida: number; tokensCache: number; costeIaUsdMicros: number; creditosCobrados: number; tipoTarea: string;
};

export interface AlmacenSimulador {
  /** Simulaciones (tareas con es_simulacion) de la empresa desde `desde`. */
  contarSimulacionesDesde(companyId: string, desde: Date): Promise<number>;
  registrarCoste(c: CosteSimulacion): Promise<void>;
  /** Suma al coste ya registrado de la simulación (p. ej. la llamada del evaluador). */
  sumarCoste(companyId: string, taskId: string, extra: { tokensEntrada: number; tokensSalida: number; costeIaUsdMicros: number }): Promise<void>;
  /** Plantilla de la que nació el agente (null en un agente propio). */
  plantillaDelAgente(companyId: string, agentId: string): Promise<string | null>;
}

export class SupabaseAlmacenSimulador implements AlmacenSimulador {
  private readonly db: SupabaseClient;
  constructor(db: SupabaseClient) { this.db = db; }

  async contarSimulacionesDesde(companyId: string, desde: Date) {
    const { count, error } = await this.db.from("tasks").select("id", { count: "exact", head: true })
      .eq("company_id", companyId).eq("es_simulacion", true).gte("started_at", desde.toISOString());
    if (error) throw new Error(`No se pudieron contar las simulaciones: ${error.message}`);
    return count ?? 0;
  }
  async registrarCoste(c: CosteSimulacion) {
    const { error } = await this.db.from("task_costs").upsert({
      task_id: c.taskId, company_id: c.companyId, agent_id: c.agentId, modelo: c.modelo, tokens_entrada: c.tokensEntrada, tokens_salida: c.tokensSalida,
      tokens_cache: c.tokensCache, coste_ia_usd_micros: c.costeIaUsdMicros, creditos_cobrados: c.creditosCobrados, tipo_tarea: c.tipoTarea,
    }, { onConflict: "task_id" });
    if (error) throw new Error(`No se pudo registrar el coste: ${error.message}`);
  }
  async sumarCoste(companyId: string, taskId: string, e: { tokensEntrada: number; tokensSalida: number; costeIaUsdMicros: number }) {
    const { data, error } = await this.db.from("task_costs").select("tokens_entrada, tokens_salida, coste_ia_usd_micros").eq("company_id", companyId).eq("task_id", taskId).maybeSingle();
    if (error || !data) throw new Error("No se pudo leer el coste de la simulación.");
    const { error: e2 } = await this.db.from("task_costs").update({
      tokens_entrada: Number(data.tokens_entrada) + e.tokensEntrada, tokens_salida: Number(data.tokens_salida) + e.tokensSalida,
      coste_ia_usd_micros: Number(data.coste_ia_usd_micros) + e.costeIaUsdMicros,
    }).eq("company_id", companyId).eq("task_id", taskId);
    if (e2) throw new Error(`No se pudo sumar el coste: ${e2.message}`);
  }
  async plantillaDelAgente(companyId: string, agentId: string) {
    const { data } = await this.db.from("agents").select("template_id").eq("company_id", companyId).eq("id", agentId).maybeSingle();
    return (data?.template_id as string | null | undefined) ?? null;
  }
}

export class InMemoryAlmacenSimulador implements AlmacenSimulador {
  simulaciones = 0;
  costes = new Map<string, CosteSimulacion>();
  plantillas = new Map<string, string>();
  async contarSimulacionesDesde() { return this.simulaciones; }
  async registrarCoste(c: CosteSimulacion) { this.costes.set(c.taskId, c); this.simulaciones++; }
  async sumarCoste(_c: string, taskId: string, e: { tokensEntrada: number; tokensSalida: number; costeIaUsdMicros: number }) {
    const c = this.costes.get(taskId);
    if (c) { c.tokensEntrada += e.tokensEntrada; c.tokensSalida += e.tokensSalida; c.costeIaUsdMicros += e.costeIaUsdMicros; }
  }
  async plantillaDelAgente(_c: string, agentId: string) { return this.plantillas.get(agentId) ?? null; }
}

/**
 * Envuelve el almacén real para el simulador: lee lo real (permisos, traspasos configurados) pero NADA escribe. Un intento de escribir lanza
 * un error (defensa en profundidad: el ejecutor ya no llega ahí en modo simulación) y las llamadas simuladas no se registran en `tool_calls`.
 */
export function almacenSoloLectura(real: AlmacenHerramientas): AlmacenHerramientas {
  const prohibido = (que: string) => async (): Promise<never> => { throw new Error(`Simulador: «${que}» escribiría en el sistema real y no está permitido.`); };
  return {
    herramientaDeAgente: (c, a, t) => real.herramientaDeAgente(c, a, t),
    herramientasDeAgente: (c, a) => real.herramientasDeAgente(c, a),
    integracionConectada: (c, p) => real.integracionConectada(c, p),
    contarLlamadasDesde: (c, a, t, d) => real.contarLlamadasDesde(c, a, t, d),
    leerAprobacion: (c, id) => real.leerAprobacion(c, id),
    llamadaPendiente: (c, id) => real.llamadaPendiente(c, id),
    traspasosConfigurados: (c, a) => real.traspasosConfigurados(c, a),
    registrarLlamada: async () => undefined,
    crearAprobacion: prohibido("crear una aprobación"),
    consumirAprobacion: prohibido("consumir una aprobación"),
    crearTareaHumana: prohibido("crear una tarea para el equipo"),
    crearTraspasoDirecto: prohibido("crear un traspaso"),
  };
}
