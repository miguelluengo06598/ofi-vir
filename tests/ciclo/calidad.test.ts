/** Alertas de calidad y la única suspensión automática: contra Supabase local. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { clienteLocal } from "../ayuda/clienteLocal.ts";
import { personaDePrueba } from "../ayuda/persona.ts";

const { db } = clienteLocal();
let companyId = "", departmentId = "", agentId = "";

before(async () => {
  companyId = randomUUID(); departmentId = randomUUID(); agentId = randomUUID();
  assert.ifError((await db.from("companies").insert({ id: companyId, name: "test calidad" })).error);
  assert.ifError((await db.from("departments").insert({ id: departmentId, company_id: companyId, slug: `q-${companyId.slice(0, 6)}`, name: "Calidad" })).error);
  assert.ifError((await db.from("agents").insert({ id: agentId, company_id: companyId, department_id: departmentId, slug: `q-${agentId.slice(0, 8)}`, name: "Agente calidad", role: "Prueba", creator_name: "Prueba", model: "claude-haiku-5-5", estado: "en_pruebas" })).error);
});
after(async () => { if (companyId) await db.from("companies").delete().eq("id", companyId); });

describe("alertas de control continuo", () => {
  it("abre una alerta al superar el umbral de valoraciones negativas y no la duplica el mismo día", async () => {
    const persona = await personaDePrueba(db, companyId);
    const tasks = Array.from({ length: 3 }, () => ({ id: randomUUID(), company_id: companyId, agent_id: agentId, title: "Tarea", model: "claude-haiku-5-5", status: "done", finished_at: new Date().toISOString(), origen: "orden_usuario", ordenado_por: persona }));
    assert.ifError((await db.from("tasks").insert(tasks)).error);
    assert.ifError((await db.from("agent_feedback").insert(tasks.map((t) => ({ company_id: companyId, agent_id: agentId, task_id: t.id, value: -1, reason: "No resolvió la petición" })))).error);
    const now = new Date().toISOString();
    const first = await db.rpc("calidad_generar_alertas", { p_ahora: now, p_company_id: companyId });
    assert.ifError(first.error); assert.equal(first.data, 1);
    const second = await db.rpc("calidad_generar_alertas", { p_ahora: now, p_company_id: companyId });
    assert.ifError(second.error); assert.equal(second.data, 0, "la alerta se deduplica por agente, causa y día");
    const { data } = await db.from("internal_alerts").select("tipo, detalle").eq("company_id", companyId).eq("agent_id", agentId).eq("tipo", "valoraciones_negativas");
    assert.equal(data?.length, 1); assert.equal((data?.[0]?.detalle as { cantidad: number }).cantidad, 3);
  });
});

describe("suspensión automática", () => {
  it("una acción ejecutada fuera de permisos suspende al agente, avisa a empresa y deja alerta interna", async () => {
    assert.ifError((await db.from("tool_calls").insert({ company_id: companyId, agent_id: agentId, tool_id: "borrar_contacto_crm", resultado: "ok", permiso: "prohibida", es_simulacion: false })).error);
    const { data: agent } = await db.from("agents").select("estado, pausado_motivo").eq("company_id", companyId).eq("id", agentId).single();
    assert.deepEqual(agent, { estado: "suspendido", pausado_motivo: "seguridad_grave" });
    const { data: sanctions } = await db.from("quality_sanctions").select("kind").eq("company_id", companyId).eq("agent_id", agentId).eq("kind", "automatic_suspension");
    assert.equal(sanctions?.length, 1);
    const { data: alerts } = await db.from("internal_alerts").select("tipo").eq("company_id", companyId).eq("agent_id", agentId).eq("tipo", "accion_fuera_permisos");
    assert.equal(alerts?.length, 1);
    const { data: notices } = await db.from("notifications").select("tipo").eq("company_id", companyId).eq("tipo", "agente_suspendido");
    assert.equal(notices?.length, 1);
  });
});
