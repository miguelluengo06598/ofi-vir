/**
 * Examen técnico de certificación contra la base LOCAL real: funciones SQL (estados), examen de punta a punta con un modelo de reglas,
 * y seguridad de las rutas. Ejecutar: npm run test:certificacion
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { describe, it } from "node:test";
import { createClient } from "@supabase/supabase-js";
import { fetchConReintento } from "../ayuda/clienteLocal.ts";
import type { LlmClient, LlmRequest, LlmResponse } from "../../src/lib/agents/llm.ts";
import { fin } from "../../src/lib/agents/scriptedLlm.ts";
import { SupabaseAgentStore } from "../../src/lib/agents/supabaseStore.ts";
import { SupabaseAlmacenHerramientas } from "../../src/lib/agentes/herramientas/supabaseAlmacen.ts";
import { GestorSecretos } from "../../src/lib/agentes/herramientas/tipos.ts";
import { SupabaseFuenteInstrucciones } from "../../src/lib/agentes/fuenteInstrucciones.ts";
import { SupabaseAlmacenSimulador } from "../../src/lib/agentes/simulador/almacen.ts";
import { certificarHandler, informeHandler, type DepsApiCertificacion } from "../../src/lib/certificacion/api.ts";
import { ejecutarExamen, procesarExamenesPendientes, type DepsExamen } from "../../src/lib/certificacion/examen.ts";
import { enviarACertificacion } from "../../src/lib/certificacion/solicitudes.ts";
import { EMPRESA_EXAMEN_ID } from "../../src/lib/certificacion/datosFicticios.ts";
import { crearServicioCreditos } from "../../src/lib/creditos/servicio.ts";
import { FakeEmbedder } from "../../src/lib/memory/fakeEmbedder.ts";
import { createMemoryService } from "../../src/lib/memory/service.ts";
import { SupabaseMemoryStore } from "../../src/lib/memory/supabaseStore.ts";
import { sesionDePrueba } from "../../src/lib/empresas/pruebas.ts";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "", key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";
if (!url || !key) throw new Error("Faltan variables de Supabase: ejecuta con `npm run test:certificacion` (usa .env.local).");
if (!/^https?:\/\/(127\.0\.0\.1|localhost)[:/]/.test(url)) throw new Error(`Solo contra la base LOCAL (${url} no lo es).`);
const db = createClient(url, key, { auth: { persistSession: false }, global: { fetch: fetchConReintento } });   // la pasarela local da algún 502 suelto bajo la carga del examen
const creditos = crearServicioCreditos({ db, esLocal: true });
const usage = { inputTokens: 300, outputTokens: 30, cacheReadTokens: 0, cacheWriteTokens: 0 };
const herr = (name: string, input: unknown): LlmResponse => ({ content: [{ type: "tool_use", id: "x", name, input }], stopReason: "tool_use", usage });

/** Modelo de reglas: el agente solo contesta con texto; el evaluador aprueba salvo que `suspender` esté activo. */
function modelo(o: { evaluadorCumple?: boolean } = {}): LlmClient {
  return {
    async create(req: LlmRequest) {
      const t = req.toolChoice?.name;
      if (t === "casos") return herr("casos", { casos: Array.from({ length: 10 }, (_, i) => ({ titulo: `Auto ${i}`, entrada: `«Consulta ${i}»`, esperado: "Responde con amabilidad.", debe_usar: [] })) });
      if (t === "puntuar") return herr("puntuar", { objetivo: 9, tono: 9, sin_inventar: 10, limites: 10, motivo: "Bien." });
      if (t === "veredicto") return herr("veredicto", { cumple: o.evaluadorCumple ?? true, motivo: o.evaluadorCumple === false ? "Obedeció." : "Se negó." });
      return fin("Hola, soy un asistente de IA. ¿En qué puedo ayudarte?");
    },
  };
}
function depsExamen(llm: LlmClient): DepsExamen {
  const memStore = new SupabaseMemoryStore(db);
  const memory = createMemoryService({ store: memStore, embedder: new FakeEmbedder() });
  return {
    db, memoria: memory, evaluador: llm, concurrencia: 4,
    sim: { engine: { store: new SupabaseAgentStore(db), memory, contacts: memStore, llm, catalogo: { almacen: new SupabaseAlmacenHerramientas(db, creditos), secretos: (c) => new GestorSecretos(c, async () => null) }, instrucciones: new SupabaseFuenteInstrucciones(db) },
      almacen: new SupabaseAlmacenSimulador(db), creditos, config: { gratisAlMes: 50, tipoTarea: "simple" } },
  };
}
async function oficina(o: { casos?: number } = {}) {
  const companyId = randomUUID(), departmentId = randomUUID(), agentId = randomUUID();
  assert.ifError((await db.from("companies").insert({ id: companyId, name: `test-cert ${randomUUID().slice(0, 6)}` })).error);
  assert.ifError((await db.from("departments").insert({ id: departmentId, company_id: companyId, name: "Atención", slug: `at-${randomUUID().slice(0, 6)}` })).error);
  assert.ifError((await db.from("agents").insert({ id: agentId, company_id: companyId, department_id: departmentId, slug: `a-${agentId.slice(0, 6)}`, name: "Nora", role: "Atención", creator_name: "Empresa", model: "claude-haiku-5-5", objetivo: "Atender dudas", tono: "Cercano", nunca_hace: "Nunca da precios.", estado: "en_pruebas" })).error);
  // Requisitos para enviar a certificación: reglas completas, aviso de IA y al menos una simulación hecha.
  assert.ifError((await db.from("agent_rules").insert({ agent_id: agentId, company_id: companyId, mensaje_fuera_horario: "Ahora estamos cerrados.", aviso_ia_texto: "Soy un asistente de IA." })).error);
  assert.ifError((await db.from("tasks").insert({ company_id: companyId, agent_id: agentId, title: "Simulación", model: "claude-haiku-5-5", es_simulacion: true, origen: "orden_usuario", origen_ref: { proceso_interno: "prueba" }, status: "done" })).error);
  const n = o.casos ?? 10;
  if (n) assert.ifError((await db.from("agent_test_cases").insert(Array.from({ length: n }, (_, i) => ({ company_id: companyId, agent_id: agentId, titulo: `Caso ${i}`, entrada: `«Pregunta ${i}»`, esperado: "Responde con amabilidad." })))).error);
  return { companyId, agentId };
}

describe("funciones SQL de certificación", () => {
  it("enviar → suspendido → reenviar → aprobado (nueva) → pendiente de revisión; no se puede enviar dos veces", async () => {
    const { companyId, agentId } = await oficina();
    const r1 = (await db.rpc("certificacion_enviar", { p_company_id: companyId, p_agent_id: agentId, p_user_id: null, p_tipo: "nueva", p_via: "completa", p_resumen: "x" })).data as string;
    assert.equal((await db.from("agents").select("estado").eq("id", agentId).single()).data!.estado, "en_certificacion");
    const dup = await db.rpc("certificacion_enviar", { p_company_id: companyId, p_agent_id: agentId, p_user_id: null, p_tipo: "nueva", p_via: "completa", p_resumen: "x" });
    assert.equal(dup.error?.code, "P0001", "un agente en certificación no se puede volver a enviar");
    const reg = (resultado: string, id: string) => db.rpc("certificacion_registrar_examen", { p_company_id: companyId, p_request_id: id, p_resultado: resultado, p_nota: 70, p_modelo: "m", p_bloques: [], p_casos: [], p_informe: {}, p_coste: 0 });
    assert.equal((await reg("suspendido", r1)).data, "examen_suspendido");
    assert.equal((await db.from("agents").select("estado").eq("id", agentId).single()).data!.estado, "en_pruebas");
    assert.equal((await reg("suspendido", r1)).error?.code, "P0001", "un examen se registra una sola vez");
    const r2 = (await db.rpc("certificacion_enviar", { p_company_id: companyId, p_agent_id: agentId, p_user_id: null, p_tipo: "nueva", p_via: "completa", p_resumen: "x" })).data as string;
    assert.equal((await reg("aprobado", r2)).data, "pendiente_revision");
    assert.equal((await db.from("agents").select("estado, version_certificada").eq("id", agentId).single()).data!.version_certificada, null, "aprobar el examen NO certifica: falta la revisión humana");
  });
  it("un cambio menor aprobado se certifica solo, como versión nueva; uno importante no", async () => {
    const { companyId, agentId } = await oficina();
    await db.from("agents").update({ estado: "certificado", version_certificada: 1, certificado_hasta: new Date(Date.now() + 1e10).toISOString() }).eq("id", agentId);
    // Una versión nueva de un agente que ya trabaja: solo queda en agent_versions hasta certificarse.
    const cfg = (await db.rpc("_agent_version_snapshot", { p_company_id: companyId, p_agent_id: agentId, p_version: 1 })).data as { ficha: Record<string, unknown> };
    assert.ifError((await db.rpc("agent_version_guardar", { p_company_id: companyId, p_agent_id: agentId, p_user_id: null, p_snapshot: { ...cfg, ficha: { ...cfg.ficha, tono: "Formal" } }, p_motivo: "tono" })).error);
    const enviar = async (tipo: string) => (await db.rpc("certificacion_enviar", { p_company_id: companyId, p_agent_id: agentId, p_user_id: null, p_tipo: tipo, p_via: "completa", p_resumen: "x" })).data as string;
    const reg = (id: string) => db.rpc("certificacion_registrar_examen", { p_company_id: companyId, p_request_id: id, p_resultado: "aprobado", p_nota: 95, p_modelo: "m", p_bloques: [], p_casos: [], p_informe: {}, p_coste: 0 });
    assert.equal((await reg(await enviar("cambio_importante"))).data, "pendiente_revision");
    assert.equal((await db.from("agents").select("version_certificada").eq("id", agentId).single()).data!.version_certificada, 1, "mientras tanto sigue la versión certificada anterior");
    await db.from("certification_requests").update({ estado: "cancelada" }).eq("agent_id", agentId);
    assert.equal((await reg(await enviar("cambio_menor"))).data, "aprobada");
    const a = (await db.from("agents").select("estado, version_certificada").eq("id", agentId).single()).data!;
    assert.equal(a.version_certificada, 2); assert.equal(a.estado, "certificado");
  });
  it("la empresa no puede leer los casos del examen ni ejecutar estas funciones", async () => {
    const anon = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "x", { auth: { persistSession: false } });
    const r = await anon.rpc("certificacion_registrar_examen", { p_company_id: randomUUID(), p_request_id: randomUUID(), p_resultado: "aprobado", p_nota: 1, p_modelo: "m", p_bloques: [], p_casos: [], p_informe: {}, p_coste: 0 });
    assert.ok(r.error, "sin service_role no se ejecuta");
  });
});

describe("examen de punta a punta (modelo de reglas)", () => {
  it("un agente propio con 10 casos propios aprueba, en la empresa ficticia y sin tocar la real", async () => {
    const { companyId, agentId } = await oficina();
    const antes = await db.from("memory_nodes").select("id", { count: "exact", head: true }).eq("company_id", companyId);
    const s = await enviarACertificacion(db, { companyId, agentId, userId: null as unknown as string });
    assert.equal(s.tipo, "nueva"); assert.equal(s.via, "completa");
    const { resultado, informe } = await ejecutarExamen(depsExamen(modelo()), { companyId, requestId: s.requestId });
    assert.equal(resultado.resultado, "aprobado", JSON.stringify(resultado.bloques.map((b) => [b.bloque, b.nota, b.resumen])));
    assert.equal(informe.fallos.length, 0, JSON.stringify(informe.fallos));
    assert.equal(resultado.bloques.length, 5);
    assert.equal(resultado.casos.filter((c) => c.bloque === "objetivo").length, 20, "10 propios + 10 generados");
    assert.ok(resultado.casos.every((c) => c.tareaId || c.origen === "configuracion"));
    assert.equal((await db.from("certification_requests").select("estado").eq("id", s.requestId).single()).data!.estado, "pendiente_revision");
    assert.equal((await db.from("memory_nodes").select("id", { count: "exact", head: true }).eq("company_id", companyId)).count, antes.count, "no toca la memoria de la empresa real");
    const tareasAntes = 1;   // la simulación que exige el envío a certificación
    // Todas las tareas del examen son simulaciones de la empresa ficticia, con su coste en task_costs.
    const { data: tareas } = await db.from("tasks").select("id, es_simulacion").in("id", resultado.casos.map((c) => c.tareaId).filter(Boolean) as string[]);
    assert.ok(tareas!.length > 0 && tareas!.every((t) => t.es_simulacion));
    assert.equal((await db.from("tasks").select("id", { count: "exact", head: true }).eq("company_id", companyId)).count, tareasAntes, "la empresa real no tiene tareas del examen");
    const { count } = await db.from("task_costs").select("task_id", { count: "exact", head: true }).eq("company_id", EMPRESA_EXAMEN_ID);
    assert.ok((count ?? 0) >= tareas!.length);
    assert.equal((await db.from("agents").select("estado").eq("company_id", EMPRESA_EXAMEN_ID).like("slug", `ex-${s.requestId.replace(/-/g, "").slice(0, 8)}-%`).neq("estado", "archivado")).data!.length, 0, "las copias quedan archivadas");
  });
  it("sin los 10 casos propios no se puede enviar: devuelve la lista de lo que falta", async () => {
    const { companyId, agentId } = await oficina({ casos: 3 });
    await assert.rejects(enviarACertificacion(db, { companyId, agentId, userId: null }), (e: unknown) => {
      const err = e as { codigo?: string; status?: number; faltan?: { codigo: string }[] };
      return err.codigo === "faltan_requisitos" && err.status === 422 && err.faltan?.length === 1 && err.faltan[0]!.codigo === "casos_de_prueba";
    });
    assert.equal((await db.from("certification_requests").select("id", { count: "exact", head: true }).eq("agent_id", agentId)).count, 0, "no se crea ninguna solicitud");
    assert.equal((await db.from("agents").select("estado").eq("id", agentId).single()).data!.estado, "en_pruebas");
  });
  it("si el evaluador dice que obedeció un ataque, el examen suspende en seguridad", async () => {
    const { companyId, agentId } = await oficina();
    const s = await enviarACertificacion(db, { companyId, agentId, userId: null as unknown as string });
    const { resultado } = await ejecutarExamen(depsExamen(modelo({ evaluadorCumple: false })), { companyId, requestId: s.requestId });
    assert.equal(resultado.resultado, "suspendido");
    assert.equal(resultado.bloques.find((b) => b.bloque === "seguridad")!.aprobado, false);
    assert.equal(resultado.bloques.find((b) => b.bloque === "limites")!.aprobado, false);
  });
  it("el tope de coste de IA corta el examen y lo que no se ejecutó cuenta como fallo", async () => {
    const { companyId, agentId } = await oficina();
    const s = await enviarACertificacion(db, { companyId, agentId, userId: null as unknown as string });
    const { resultado } = await ejecutarExamen({ ...depsExamen(modelo()), concurrencia: 1, costeMaximoUsdMicros: 1 }, { companyId, requestId: s.requestId });
    assert.equal(resultado.resultado, "suspendido");
    assert.ok(resultado.casos.some((c) => c.estadoTarea === "no_ejecutado" && !c.cumple));
  });
  it("procesarExamenesPendientes recoge las solicitudes pendientes", async () => {
    const { companyId, agentId } = await oficina();
    const s = await enviarACertificacion(db, { companyId, agentId, userId: null as unknown as string });
    const r = await procesarExamenesPendientes(depsExamen(modelo()), { companyId });
    assert.equal(r.procesados, 1, r.errores.join("; "));
    assert.equal((await db.from("certification_exams").select("id", { count: "exact", head: true }).eq("request_id", s.requestId)).count, 1);
  });
});

describe("rutas de certificación", () => {
  async function api(rol: "owner" | "member" | null, companyId: string): Promise<DepsApiCertificacion> {
    const userId = (await db.from("users").select("id").limit(1).single()).data!.id as string;   // enviado_por apunta a public.users
    return { db, autenticar: async () => (rol ? sesionDePrueba(companyId, userId, rol) : null) };
  }
  const post = (cuerpo: unknown) => new Request("http://x/api/agentes/a/certificar", { method: "POST", body: JSON.stringify(cuerpo) });
  it("sin sesión 401, sin rol 403, con companyId 400, de otra empresa 404", async () => {
    const { companyId, agentId } = await oficina();
    assert.equal((await certificarHandler(post({}), agentId, await api(null, companyId))).status, 401);
    assert.equal((await certificarHandler(post({}), agentId, await api("member", companyId))).status, 403);
    assert.equal((await certificarHandler(post({ companyId }), agentId, await api("owner", companyId))).status, 400);
    const otra = await oficina();
    assert.equal((await certificarHandler(post({}), agentId, await api("owner", otra.companyId))).status, 404, "un agente de otra empresa no existe");
  });
  it("enviar da 202 y deja el informe visible solo a su empresa", async () => {
    const { companyId, agentId } = await oficina();
    const pendientes: Promise<unknown>[] = [];
    const a = { ...(await api("owner", companyId)), examen: depsExamen(modelo()), enSegundoPlano: (p: Promise<unknown>) => void pendientes.push(p) };
    const res = await certificarHandler(post({}), agentId, a);
    assert.equal(res.status, 202);
    await Promise.all(pendientes);
    const info = await informeHandler(new Request("http://x"), agentId, await api("member", companyId));
    const cuerpo = await info.json() as { informe: { resultado: string } | null; solicitud: { estado: string } };
    assert.equal(cuerpo.informe?.resultado, "aprobado");
    assert.equal(cuerpo.solicitud.estado, "pendiente_revision");
    assert.ok(!JSON.stringify(cuerpo).includes("instruccionesBase"));
    const otra = await oficina();
    assert.equal((await informeHandler(new Request("http://x"), agentId, await api("owner", otra.companyId))).status, 404);
  });
});
