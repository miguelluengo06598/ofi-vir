import { SupabaseMemoryStore } from "../memory/supabaseStore.ts";
import { embedderFromEnv } from "../memory/embedderFromEnv.ts";
import { createMemoryService } from "../memory/service.ts";
import { AnthropicLlm } from "./anthropicClient.ts";
import type { EngineDeps } from "./loop.ts";
import { createClient } from "@supabase/supabase-js";
import { estadoDeOficina, oficinaPuedeEjecutar } from "../creditos/rutinas.ts";
import { SupabaseAgentStore } from "./supabaseStore.ts";
import { crearServicioReglas, SupabaseAlmacenReglas } from "../agentes/reglas/index.ts";
import { SupabaseAlmacenHerramientas } from "../agentes/herramientas/supabaseAlmacen.ts";
import { GestorSecretos } from "../agentes/herramientas/tipos.ts";
import { crearServicioCreditos } from "../creditos/servicio.ts";
import { lectorDeSecretos } from "../integraciones/servicio.ts";
import { depsConexionesDesdeEntorno } from "../integraciones/api.ts";
import { SupabaseFuenteInstrucciones } from "../agentes/fuenteInstrucciones.ts";

/** Motor con todo conectado (Supabase, memoria, Claude). null si falta la base o la clave de Anthropic. */
export function motorDesdeEntorno(): { deps: EngineDeps; store: SupabaseAgentStore } | null {
  const store = SupabaseAgentStore.fromEnv();
  const memStore = SupabaseMemoryStore.fromEnv();
  const llm = AnthropicLlm.fromEnv();
  if (!store || !memStore || !llm) return null;
  // Una oficina sin saldo, pausada o pendiente de borrado no ejecuta agentes (el correo entrante se sigue guardando).
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const oficinaActiva = async (companyId: string) => oficinaPuedeEjecutar(await estadoDeOficina(db, companyId));
  // Solo un agente activo y con la certificación vigente trabaja con datos reales (la base decide y avisa a la empresa si no).
  const puedeTrabajar = async (companyId: string, agentId: string) => {
    const { data, error } = await db.rpc("agente_comprobar_trabajo", { p_company_id: companyId, p_agent_id: agentId });
    if (error) throw new Error("No se pudo comprobar la certificación del agente.");
    return data === true;
  };
  const memory = createMemoryService({ store: memStore, embedder: embedderFromEnv() });
  // Reglas del agente (horario, tope de créditos, límite de mensajes, aviso de IA), aplicadas en el servidor.
  const reglas = crearServicioReglas({ almacen: new SupabaseAlmacenReglas(db), memory, memStore });
  // Modo catálogo: herramientas, permisos, aprobaciones, traspasos y reglas con todo conectado (créditos incluidos).
  const almacen = new SupabaseAlmacenHerramientas(db, crearServicioCreditos({ db }));
  const conexiones = depsConexionesDesdeEntorno();
  const secretos = (companyId: string) => new GestorSecretos(companyId, conexiones ? lectorDeSecretos(conexiones.deps) : async () => null);
  // Las tareas reales usan el mismo montaje protegido que el simulador: reglas de plataforma,
  // plantilla privada, configuración certificada y contenido externo separado del sistema.
  const instrucciones = new SupabaseFuenteInstrucciones(db);
  return { store, deps: { store, memory, contacts: memStore, llm, oficinaActiva, puedeTrabajar, reglas, catalogo: { almacen, secretos }, instrucciones } };
}
