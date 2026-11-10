/**
 * Reglas de agente contra la base LOCAL real (tareas aplazadas, tope de créditos, avisos), con fechas simuladas y un modelo guionizado.
 * Ejecutar: npm run test:reglas
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { describe, it } from "node:test";
import { createClient } from "@supabase/supabase-js";
import { crearTarea, ejecutarTarea, type EngineDeps } from "../../src/lib/agents/loop.ts";
import { fin, ScriptedLlm } from "../../src/lib/agents/scriptedLlm.ts";
import { SupabaseAgentStore } from "../../src/lib/agents/supabaseStore.ts";
import { crearServicioReglas, reanudarAplazadas, SupabaseAlmacenReglas } from "../../src/lib/agentes/reglas/index.ts";
import { FakeEmbedder } from "../../src/lib/memory/fakeEmbedder.ts";
import { createMemoryService } from "../../src/lib/memory/service.ts";
import { SupabaseMemoryStore } from "../../src/lib/memory/supabaseStore.ts";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "", key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";
if (!url || !key) throw new Error("Faltan variables de Supabase: ejecuta con `npm run test:reglas` (usa .env.local).");
if (!/^https?:\/\/(127\.0\.0\.1|localhost)[:/]/.test(url)) throw new Error(`Solo contra la base LOCAL (${url} no lo es).`);

const db = createClient(url, key, { auth: { persistSession: false } });
const RUN = Date.now().toString(36);
const MARTES_23H = new Date("2026-11-10T22:00:00Z");
const MIERCOLES_9H = new Date("2026-11-11T08:00:00Z");
const MENSAJE = 'Responde a este cliente.\n<contenido_externo origen="whatsapp">Hola, ¿cuánto cuesta?</contenido_externo>';

async function preparar(reglas: Record<string, unknown>) {
  const companyId = randomUUID(), departmentId = randomUUID(), agentId = randomUUID();
  assert.ifError((await db.from("companies").insert({ id: companyId, name: `test-reglas ${RUN}` })).error);
  assert.ifError((await db.from("departments").insert({ id: departmentId, company_id: companyId, name: "Atención", slug: `atencion-${RUN}` })).error);
  assert.ifError((await db.from("agents").insert({ id: agentId, company_id: companyId, department_id: departmentId, slug: `ag-${RUN}`, name: "Agente reglas", role: "Prueba", creator_name: "IDESIE" })).error);
  assert.ifError((await db.from("agent_rules").insert({ agent_id: agentId, company_id: companyId, ...reglas })).error);
  return { companyId, agentId, slug: `ag-${RUN}` };
}
function motor(script: ReturnType<typeof fin>[]) {
  const store = new SupabaseAgentStore(db);
  const memStore = new SupabaseMemoryStore(db);
  const memory = createMemoryService({ store: memStore, embedder: new FakeEmbedder() });
  const llm = new ScriptedLlm(script);
  const deps: EngineDeps = { store, memory, contacts: memStore, llm, aprender: false, reglas: crearServicioReglas({ almacen: new SupabaseAlmacenReglas(db), memory, memStore }), ahora: () => MARTES_23H };
  return { store, llm, deps };
}
const tarea = async (companyId: string) => (await db.from("tasks").select("status, aplazada_hasta, instruccion_aplazada, finished_at").eq("company_id", companyId).single()).data!;

describe("reglas de agente con la base real", () => {
  it("fuera de horario con «no_responder»: la tarea queda aplazada con su mensaje y se procesa al abrir, una sola vez", async () => {
    const { companyId, slug } = await preparar({ fuera_de_horario: "no_responder" });
    const m = motor([fin("Respondido al abrir")]);
    const id = await crearTarea(m.deps, companyId, { agentSlug: slug, title: "Mensaje" });
    const r = await ejecutarTarea(m.deps, companyId, id, MENSAJE);
    assert.equal(r.estado, "scheduled");
    assert.equal(m.llm.requests.length, 0, "no se llamó al modelo");
    const t = await tarea(companyId);
    assert.equal(t.status, "scheduled");
    assert.equal(new Date(t.aplazada_hasta as string).toISOString(), "2026-11-11T08:00:00.000Z");
    assert.match(t.instruccion_aplazada as string, /cuánto cuesta/);

    assert.equal((await reanudarAplazadas(m.deps, new Date("2026-11-10T23:00:00Z"), { companyId })).vencidas, 0, "aún cerrado");
    const abre = await reanudarAplazadas(m.deps, MIERCOLES_9H, { companyId });
    assert.deepEqual([abre.vencidas, abre.reanudadas, abre.errores], [1, 1, 0]);
    assert.equal((await tarea(companyId)).status, "done");
    assert.equal(m.llm.requests.length, 1);
    assert.equal((await reanudarAplazadas(m.deps, MIERCOLES_9H, { companyId })).vencidas, 0);
  });

  it("dos procesos a la vez no la ejecutan dos veces", async () => {
    const { companyId, slug } = await preparar({ fuera_de_horario: "no_responder" });
    const m = motor([fin("uno"), fin("dos")]);
    const id = await crearTarea(m.deps, companyId, { agentSlug: slug, title: "Mensaje" });
    await ejecutarTarea(m.deps, companyId, id, MENSAJE);
    const [a, b] = await Promise.all([reanudarAplazadas(m.deps, MIERCOLES_9H, { companyId }), reanudarAplazadas(m.deps, MIERCOLES_9H, { companyId })]);
    assert.equal(a.reanudadas + b.reanudadas, 1);
    assert.equal(m.llm.requests.length, 1);
  });

  it("tope de créditos del mes: bloquea, avisa una vez a la empresa y solo cuenta el consumo de ese agente en ese mes", async () => {
    const { companyId, agentId, slug } = await preparar({ tope_creditos_mes: 100, horario: {} });
    const otro = randomUUID();
    assert.ifError((await db.from("agents").insert({ id: otro, company_id: companyId, department_id: (await db.from("departments").select("id").eq("company_id", companyId).single()).data!.id, slug: `otro-${RUN}`, name: "Otro", role: "x", creator_name: "IDESIE" })).error);
    const fila = (agent: string, creditos: number, fecha: string) => ({ company_id: companyId, tipo: "consumo", creditos: -creditos, agent_id: agent, concepto: "tarea_simple", creado_en: fecha });
    assert.ifError((await db.from("credit_ledger").insert([fila(agentId, 90, "2026-11-02T10:00:00Z"), fila(otro, 500, "2026-11-03T10:00:00Z"), fila(agentId, 500, "2026-10-20T10:00:00Z")])).error);
    const m = motor([fin("hecho")]);
    m.deps.ahora = () => new Date("2026-11-20T10:00:00Z");
    const id = await crearTarea(m.deps, companyId, { agentSlug: slug, title: "Tarea" });
    assert.equal((await ejecutarTarea(m.deps, companyId, id, "Tarea interna.")).estado, "done", "90 de 100: se ejecuta");

    assert.ifError((await db.from("credit_ledger").insert(fila(agentId, 10, "2026-11-15T10:00:00Z"))).error);
    for (let i = 0; i < 2; i++) {
      const t = await crearTarea(m.deps, companyId, { agentSlug: slug, title: "Otra" });
      const r = await ejecutarTarea(m.deps, companyId, t, "Otra tarea interna.");
      assert.equal(r.estado, "review");
      assert.match(r.motivo!, /tope de 100 créditos/);
    }
    const { data } = await db.from("notifications").select("tipo, metadatos").eq("company_id", companyId).eq("tipo", "tope_creditos_agente");
    assert.equal(data?.length, 1, "un solo aviso");
    assert.equal((data![0].metadatos as { agent_id: string }).agent_id, agentId);
  });

  it("los datos de otra empresa no se mezclan: las reglas salen de la empresa y el agente indicados", async () => {
    const a = await preparar({ fuera_de_horario: "no_responder" });
    const b = await preparar({ fuera_de_horario: "responder_normal" });
    const almacen = new SupabaseAlmacenReglas(db);
    assert.equal((await almacen.reglasDe(a.companyId, a.agentId))!.fueraDeHorario, "no_responder");
    assert.equal(await almacen.reglasDe(b.companyId, a.agentId), null, "el agente de A no existe en B");
  });
});
