/**
 * Simulador de agentes contra la base LOCAL real: sin efectos (nada se escribe), aprobaciones y traspasos solo mostrados, es_simulacion,
 * cuota gratis / cobro en créditos, task_costs, casos de prueba y seguridad de la ruta. El modelo es un guion (ScriptedLlm).
 * Ejecutar: npm run test:simulador
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { describe, it } from "node:test";
import { createClient } from "@supabase/supabase-js";
import type { LlmResponse } from "../../src/lib/agents/llm.ts";
import { fin, llamada, ScriptedLlm } from "../../src/lib/agents/scriptedLlm.ts";
import { SupabaseAgentStore } from "../../src/lib/agents/supabaseStore.ts";
import { SupabaseAlmacenHerramientas } from "../../src/lib/agentes/herramientas/supabaseAlmacen.ts";
import { GestorSecretos } from "../../src/lib/agentes/herramientas/tipos.ts";
import { definirPlantilla } from "../../src/lib/agentes/plantillas/tipos.ts";
import { SupabaseAlmacenSimulador } from "../../src/lib/agentes/simulador/almacen.ts";
import { casosHandler, simularHandler, type DepsApiSimulador } from "../../src/lib/agentes/simulador/api.ts";
import { probarCasosDePlantilla, SimuladorError, simularAgente, type DepsSimulador } from "../../src/lib/agentes/simulador/servicio.ts";
import { crearServicioCreditos } from "../../src/lib/creditos/servicio.ts";
import { FakeEmbedder } from "../../src/lib/memory/fakeEmbedder.ts";
import { createMemoryService } from "../../src/lib/memory/service.ts";
import { SupabaseMemoryStore } from "../../src/lib/memory/supabaseStore.ts";
import { personaDePrueba } from "../ayuda/persona.ts";
import { sesionDePrueba } from "../../src/lib/empresas/pruebas.ts";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "", key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";
if (!url || !key) throw new Error("Faltan variables de Supabase: ejecuta con `npm run test:simulador` (usa .env.local).");
if (!/^https?:\/\/(127\.0\.0\.1|localhost)[:/]/.test(url)) throw new Error(`Solo contra la base LOCAL (${url} no lo es).`);

const db = createClient(url, key, { auth: { persistSession: false } });
const creditos = crearServicioCreditos({ db, esLocal: true });
const TEL = "+34600111222";
const FICHA_LEAD = { nombre: "Laura Gómez", contacto: "laura@ejemplo.es", interes: "Plan anual" };

async function oficina(o: { saldo?: boolean } = {}) {
  const companyId = randomUUID(), departmentId = randomUUID();
  assert.ifError((await db.from("companies").insert({ id: companyId, name: `test-simulador ${randomUUID().slice(0, 6)}` })).error);
  assert.ifError((await db.from("departments").insert({ id: departmentId, company_id: companyId, name: "Atención", slug: `at-${randomUUID().slice(0, 6)}` })).error);
  const mk = async (name: string, plantilla: string | null) => {
    const id = randomUUID();
    assert.ifError((await db.from("agents").insert({ id, company_id: companyId, department_id: departmentId, slug: `${name.toLowerCase()}-${id.slice(0, 6)}`, name, role: "Prueba", creator_name: "IDESIE", model: "claude-haiku-5-5", template_id: plantilla })).error);
    return { id, name };
  };
  const sara = await mk("Sara", "sara-whatsapp"), lucia = await mk("Lucía", null);
  const tools: [string, string][] = [["responder_whatsapp", "sola"], ["crear_cita", "aprobacion"], ["guardar_recuerdo", "sola"], ["pasar_a_agente", "sola"], ["pasar_a_humano", "sola"], ["buscar_en_memoria", "sola"]];
  assert.ifError((await db.from("agent_tools").insert(tools.map(([t, p]) => ({ agent_id: sara.id, company_id: companyId, tool_id: t, permiso: p })))).error);
  assert.ifError((await db.from("agent_handoffs").insert({ company_id: companyId, agent_id_origen: sara.id, agent_id_destino: lucia.id, condicion: "quieren contratar", tipo_traspaso: "lead" })).error);
  if (o.saldo !== false) await creditos.anadirCreditos(companyId, "prueba", "prueba", null, `test-simulador:${companyId}`);
  return { companyId, sara, lucia };
}
function deps(script: (LlmResponse | Error)[], gratisAlMes = 50, plantilla?: DepsSimulador["plantilla"]): { d: DepsSimulador; llm: ScriptedLlm } {
  const memStore = new SupabaseMemoryStore(db);
  const llm = new ScriptedLlm(script);
  return {
    llm,
    d: {
      engine: { store: new SupabaseAgentStore(db), memory: createMemoryService({ store: memStore, embedder: new FakeEmbedder() }), contacts: memStore, llm,
        catalogo: { almacen: new SupabaseAlmacenHerramientas(db, creditos), secretos: (c) => new GestorSecretos(c, async () => null) } },
      almacen: new SupabaseAlmacenSimulador(db), creditos, config: { gratisAlMes, tipoTarea: "simple" }, plantilla,
    },
  };
}
const TABLAS = ["memory_nodes", "contacts", "approvals", "handoffs", "human_tasks", "tool_calls", "credit_ledger", "notifications"];
const foto = async (companyId: string) => Object.fromEntries(await Promise.all(TABLAS.map(async (t) => [t, (await db.from(t).select("id", { count: "exact", head: true }).eq("company_id", companyId)).count ?? 0])));
const veredicto = (cumple: boolean, motivo: string): LlmResponse => ({ content: [{ type: "tool_use", id: "v", name: "veredicto", input: { cumple, motivo } }], stopReason: "tool_use", usage: { inputTokens: 500, outputTokens: 30, cacheReadTokens: 0, cacheWriteTokens: 0 } });

describe("simulador de agentes con la base real", () => {
  it("usa simular() para todo: no escribe nada, muestra aprobaciones y traspasos, marca es_simulacion y registra task_costs", async () => {
    const { companyId, sara } = await oficina();
    const { d } = deps([
      llamada("1", "guardar_recuerdo", { contacto: { nombre: "Laura Gómez", email: "laura@ejemplo.es" }, nodos: [{ clave: "a", tipo: "dato", titulo: "Quiere plan anual", contenido: "x" }] }),
      llamada("2", "crear_cita", { titulo: "Cita Laura", inicio: "2026-11-17T17:30:00+01:00", duracion_min: 30 }),
      llamada("3", "pasar_a_agente", { agente_destino: "Lucía", resumen: "Quiere el plan anual", ficha: FICHA_LEAD }),
      llamada("4", "pasar_a_humano", { motivo: "Duda", resumen: "Consulta", urgencia: "normal" }),
      llamada("5", "responder_whatsapp", { telefono: TEL, mensaje: "Te pasamos con Ventas." }),
      fin("Hecho."),
    ]);
    const antes = await foto(companyId);
    const r = await simularAgente(d, { ordenadoPor: { procesoInterno: "prueba" }, companyId, agentId: sara.id, mensaje: "Quiero contratar el plan anual", canal: "whatsapp" });
    assert.deepEqual(await foto(companyId), antes, "ninguna tabla real cambia");
    assert.equal(r.estado, "done");
    assert.deepEqual(r.herramientas.map((h) => [h.herramienta, h.estado]), [["guardar_recuerdo", "ok"], ["crear_cita", "pendiente_aprobacion"], ["pasar_a_agente", "ok"], ["pasar_a_humano", "ok"], ["responder_whatsapp", "ok"]]);
    assert.match(r.herramientas[0].resultado, /Simulación/);
    assert.deepEqual(r.aprobaciones.map((a) => a.herramienta), ["crear_cita"]);
    assert.equal(r.traspasos.length, 1);
    assert.equal(r.traspasos[0].destino, "Lucía");
    assert.equal(r.traspasos[0].tipo, "lead");
    assert.deepEqual(r.traspasos[0].ficha, FICHA_LEAD);
    assert.deepEqual(r.mensajesAlCliente, [{ herramienta: "responder_whatsapp", texto: "Te pasamos con Ventas." }]);
    assert.equal(r.creditosEstimados.tarea, 2);        // plantilla sara: tarea simple
    assert.equal(r.creditosEstimados.traspasos, 1);
    assert.equal(r.creditosEstimados.mensajes, 5);     // WhatsApp (tarifa provisional)
    assert.equal(r.simulacion.gratis, true);

    const { data: t } = await db.from("tasks").select("es_simulacion, status").eq("id", r.tareaId).single();
    assert.deepEqual(t, { es_simulacion: true, status: "done" });
    const { data: c } = await db.from("task_costs").select("creditos_cobrados, tipo_tarea, tokens_entrada").eq("task_id", r.tareaId).single();
    assert.equal(c?.creditos_cobrados, 0);
    assert.equal(c?.tipo_tarea, "simple");
    assert.ok(Number(c?.tokens_entrada) > 0);
  });

  it("una ficha de traspaso inválida se rechaza también en la simulación (Claude recibe el error y no cuenta como traspaso)", async () => {
    const { companyId, sara } = await oficina();
    const { d, llm } = deps([llamada("1", "pasar_a_agente", { agente_destino: "Lucía", resumen: "x", ficha: { nombre: "Laura" } }), fin("No pude.")]);
    const r = await simularAgente(d, { ordenadoPor: { procesoInterno: "prueba" }, companyId, agentId: sara.id, mensaje: "Plan anual", canal: "interno" });
    assert.equal(r.traspasos.length, 0);
    assert.equal(r.herramientas[0].estado, "error");
    assert.match(JSON.stringify(llm.requests[1].messages), /contacto|interes/);
  });

  it("el historial y el canal: un mensaje de fuera va como <contenido_externo>; uno interno, no", async () => {
    const { companyId, sara } = await oficina();
    const a = deps([fin("ok")]);
    await simularAgente(a.d, { ordenadoPor: { procesoInterno: "prueba" }, companyId, agentId: sara.id, mensaje: "¿Y el sábado?", canal: "whatsapp", historial: [{ rol: "persona", texto: "Hola" }, { rol: "agente", texto: "¡Hola!" }] });
    const u = JSON.stringify(a.llm.requests[0].messages[0].content);
    assert.match(u, /<contenido_externo origen=\\"whatsapp\\">/);
    assert.match(u, /Persona: Hola/);
    assert.match(u, /Agente: ¡Hola!/);
    const b = deps([fin("ok")]);
    await simularAgente(b.d, { ordenadoPor: { procesoInterno: "prueba" }, companyId, agentId: sara.id, mensaje: "Revisa la agenda", canal: "interno" });
    assert.doesNotMatch(JSON.stringify(b.llm.requests[0].messages[0].content), /contenido_externo/);
  });

  it("cuota: las primeras son gratis; pasada la cuota cada una cuesta 2 créditos (reserva → confirmación) y queda en task_costs", async () => {
    const { companyId, sara } = await oficina();
    const saldo = async () => (await creditos.obtenerSaldo(companyId)).disponible;
    const s0 = await saldo();
    const a = await simularAgente(deps([fin("1")], 1).d, { ordenadoPor: { procesoInterno: "prueba" }, companyId, agentId: sara.id, mensaje: "uno", canal: "interno" });
    assert.equal(a.simulacion.gratis, true);
    assert.equal(await saldo(), s0);
    const b = await simularAgente(deps([fin("2")], 1).d, { ordenadoPor: { procesoInterno: "prueba" }, companyId, agentId: sara.id, mensaje: "dos", canal: "interno" });
    assert.equal(b.simulacion.gratis, false);
    assert.equal(b.simulacion.creditosCobrados, 2);
    assert.equal(await saldo(), s0 - 2);
    const { data: c } = await db.from("task_costs").select("creditos_cobrados").eq("task_id", b.tareaId).single();
    assert.equal(c?.creditos_cobrados, 2);
    const { data: l } = await db.from("credit_ledger").select("creditos, task_id").eq("company_id", companyId).eq("tipo", "consumo");
    assert.deepEqual(l?.map((x) => [x.creditos, x.task_id]), [[-2, b.tareaId]]);
  });

  it("pasada la cuota y sin saldo: 402, no se ejecuta el modelo y no se cobra nada", async () => {
    const { companyId, sara } = await oficina({ saldo: false });
    const m = deps([fin("no debería llamarse")], 0);
    await assert.rejects(simularAgente(m.d, { ordenadoPor: { procesoInterno: "prueba" }, companyId, agentId: sara.id, mensaje: "hola", canal: "interno" }), (e) => e instanceof SimuladorError && e.status === 402);
    assert.equal(m.llm.requests.length, 0);
    assert.equal((await db.from("credit_ledger").select("id", { count: "exact", head: true }).eq("company_id", companyId)).count, 0);
  });

  it("casos de la plantilla: comprueba herramientas (debeUsar/noDebeUsar) y usa el evaluador; el motivo del fallo viene en cada caso", async () => {
    const { companyId, sara } = await oficina();
    const plantilla = definirPlantilla({
      id: "sara-whatsapp", nombrePorDefecto: "Sara", rol: "x", departamentoTipo: "atencion", descripcionPublica: "x", queHace: [], queNoHace: [], instruccionesBase: "x", herramientas: [],
      integracionesRequeridas: [], tipoTareaPorDefecto: "simple",
      casosDePrueba: [
        { id: "a", titulo: "Responde", entrada: "Hola", esperado: "Saluda", debeUsar: ["responder_whatsapp"] },
        { id: "b", titulo: "Debe escalar", entrada: "Queja", esperado: "Escala", debeUsar: ["pasar_a_humano"] },
        { id: "c", titulo: "Mal tono", entrada: "Precio", esperado: "Sin inventar", debeUsar: ["responder_whatsapp"] },
        { id: "d", titulo: "No debe pedir cita", entrada: "Info", esperado: "Solo info", noDebeUsar: ["crear_cita"] },
      ],
    });
    const m = deps([
      llamada("1", "responder_whatsapp", { telefono: TEL, mensaje: "Hola" }), fin("ok"), veredicto(true, "Saluda bien."),
      llamada("2", "responder_whatsapp", { telefono: TEL, mensaje: "Lo sentimos" }), fin("ok"),                       // b: no escala → fallo automático (sin evaluador)
      llamada("3", "responder_whatsapp", { telefono: TEL, mensaje: "Cuesta 3 €" }), fin("ok"), veredicto(false, "Inventa un precio."),
      llamada("4", "crear_cita", { titulo: "x", inicio: "2026-11-17T17:30:00+01:00" }), fin("ok"),                  // d: usó crear_cita → fallo automático
    ], 50, () => plantilla);
    const antes = await foto(companyId);
    const r = await probarCasosDePlantilla(m.d, { ordenadoPor: { procesoInterno: "prueba" }, companyId, agentId: sara.id });
    assert.deepEqual(await foto(companyId), antes);
    assert.deepEqual(r.casos.map((c) => [c.id, c.cumple]), [["a", true], ["b", false], ["c", false], ["d", false]]);
    assert.deepEqual([r.total, r.cumplen, r.fallan], [4, 1, 3]);
    assert.match(r.casos[1].motivo, /No usó pasar_a_humano/);
    assert.equal(r.casos[2].motivo, "Inventa un precio.");
    assert.match(r.casos[3].motivo, /Usó crear_cita/);
    // Cada caso es una simulación con su task_costs; el evaluador suma sus tokens al caso.
    const { data: tc } = await db.from("task_costs").select("tokens_entrada").in("task_id", r.casos.map((c) => c.simulacion!.tareaId));
    assert.equal(tc?.length, 4);
  });

  it("un agente propio (sin plantilla) no tiene casos de prueba: 422", async () => {
    const { companyId, lucia } = await oficina();
    await assert.rejects(probarCasosDePlantilla(deps([]).d, { ordenadoPor: { procesoInterno: "prueba" }, companyId, agentId: lucia.id }), (e) => e instanceof SimuladorError && e.status === 422);
  });

  it("ruta: sin sesión 401; miembro 403; empresa en el cuerpo 400; agente de otra empresa 404; un propietario simula", async () => {
    const a = await oficina(), b = await oficina();
    const m = deps([fin("ok")]);
    const api = (sesion: DepsApiSimulador["autenticar"]): DepsApiSimulador => ({ deps: m.d, autenticar: sesion });
    // Quien ordena una simulación queda registrado: tiene que ser una persona real de la empresa.
    const duena = await personaDePrueba(db, a.companyId);
    const propietaria = api(async () => sesionDePrueba(a.companyId, duena, "owner"));
    const peticion = (cuerpo: unknown) => new Request("http://local/x", { method: "POST", body: JSON.stringify(cuerpo) });
    const ok = { mensaje: "Hola", canal: "interno" };
    assert.equal((await simularHandler(peticion(ok), a.sara.id, api(async () => null))).status, 401);
    assert.equal((await simularHandler(peticion(ok), a.sara.id, api(async () => sesionDePrueba(a.companyId, randomUUID(), "member")))).status, 403);
    assert.equal((await simularHandler(peticion({ ...ok, companyId: b.companyId }), a.sara.id, propietaria)).status, 400);
    assert.equal((await simularHandler(peticion({ mensaje: "Hola", canal: "sms" }), a.sara.id, propietaria)).status, 400);
    assert.equal((await simularHandler(peticion(ok), b.sara.id, propietaria)).status, 404, "agente de otra empresa");
    assert.equal((await simularHandler(peticion(ok), "no-es-uuid", propietaria)).status, 404);
    assert.equal((await casosHandler(peticion({}), a.lucia.id, propietaria)).status, 422);
    const r = await simularHandler(peticion(ok), a.sara.id, propietaria);
    assert.equal(r.status, 200);
    assert.equal(((await r.json()) as { estado: string }).estado, "done");
  });
});
