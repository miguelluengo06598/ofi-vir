/**
 * Los agentes NUNCA trabajan por iniciativa propia (en memoria, sin base): origen obligatorio, cadena válida, sin autoencargos,
 * seguimientos solo con aprobación, interruptores (AGENTES_ACTIVOS, parada de emergencia, oficina pausada) y filtro de eventos.
 * Las mismas reglas contra la base real: tests/iniciativa/iniciativa.test.ts (npm run test:iniciativa).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { FakeEmbedder } from "../memory/fakeEmbedder.ts";
import { InMemoryStore } from "../memory/inMemoryStore.ts";
import { createMemoryService } from "../memory/service.ts";
import { ejecutarHerramienta, GestorSecretos, type ContextoEjecucion } from "../agentes/herramientas/index.ts";
import { InMemoryAlmacenHerramientas } from "../agentes/herramientas/inMemoryAlmacen.ts";
import { procesarTareasPendientes } from "../agentes/traspasos/procesar.ts";
import { decidirEvento, huellaRemitente, motivoCorreoAutomatico, type ConsultasFiltro } from "../eventos/filtro.ts";
import type { LlmClient } from "./llm.ts";
import { InMemoryAgentStore } from "./inMemoryStore.ts";
import { ejecutarTarea, type EngineDeps } from "./loop.ts";
import { ORDEN_DE_PRUEBA } from "./pruebas.ts";
import { validarCadena } from "./puerta.ts";
import { fin, llamada, ScriptedLlm } from "./scriptedLlm.ts";
import type { AgentInfo, OrigenNuevo } from "./store.ts";

const C = "a64499d1-7f43-4a43-abc8-41a313dc4018";
const PRICING = { inputEur: 0.092, outputEur: 0.46, cacheReadEur: 0.0092, cacheWriteEur: 0.115 };
const agente = (id: string, name: string): AgentInfo => ({
  id, slug: id, name, role: "Prueba", departmentId: "dep", departmentName: "Ventas", model: "claude-haiku-5-5", instructions: `Eres ${name}.`,
  allowedTools: ["buscar_en_memoria", "guardar_recuerdo"],
});
const sara = agente("ag-sara", "Sara"), lucia = agente("ag-lucia", "Lucía");
const EVENTO: OrigenNuevo = { tipo: "evento_externo", eventoId: "ev-1", canal: "meta_lead" };

function setup(script: ConstructorParameters<typeof ScriptedLlm>[0] = [], over: Partial<EngineDeps> = {}) {
  const store = new InMemoryAgentStore();
  store.agents = [sara, lucia];
  store.pricing.set("claude-haiku-5-5", PRICING);
  const memStore = new InMemoryStore();
  const memory = createMemoryService({ store: memStore, embedder: new FakeEmbedder() });
  const llm = new ScriptedLlm(script);
  const deps: EngineDeps = { store, memory, contacts: memStore, llm, aprender: false, env: {}, ...over };
  return { store, llm, deps, memStore, memory };
}
const nueva = (s: ReturnType<typeof setup>, origen: OrigenNuevo, agent = sara) => s.store.createTask(C, { agentId: agent.id, title: "Tarea", model: agent.model, origen });

describe("origen obligatorio y cadena válida", () => {
  it("una tarea SIN origen no se ejecuta: queda en revisión, no llama al modelo y el bloqueo queda registrado", async () => {
    const s = setup([fin("no debería llegar")]);
    const id = s.store.insertarTareaCruda(C, { agentId: sara.id, instruccionEntrada: "Haz algo" });
    const r = await ejecutarTarea(s.deps, C, id);
    assert.equal(r.estado, "review");
    assert.match(r.motivo ?? "", /no tiene origen/);
    assert.equal(s.llm.requests.length, 0);
    assert.equal(s.store.bloqueos[0].codigo, "sin_origen");
  });

  it("un traspaso cuya cadena NO lleva a un origen válido no se ejecuta", async () => {
    const s = setup([fin("no debería llegar")]);
    const padre = s.store.insertarTareaCruda(C, { agentId: sara.id });                     // tarea «antigua» sin origen
    const hija = s.store.insertarTareaCruda(C, {
      agentId: lucia.id, instruccionEntrada: "Ficha",
      origen: { tipo: "traspaso", ref: {}, eventoId: null, tareaPadreId: padre, tareaRaizId: null, ordenadoPor: null, ordenadoEn: null, rutinaId: null, seguimientoId: null },
    });
    const r = await ejecutarTarea(s.deps, C, hija);
    assert.equal(r.estado, "review");
    assert.match(r.motivo ?? "", /cadena llega a una tarea sin origen/);
    assert.equal(s.llm.requests.length, 0);
    // Y un traspaso sin tarea padre, tampoco.
    const huerfana = s.store.insertarTareaCruda(C, {
      agentId: lucia.id, instruccionEntrada: "Ficha",
      origen: { tipo: "traspaso", ref: {}, eventoId: null, tareaPadreId: null, tareaRaizId: null, ordenadoPor: null, ordenadoEn: null, rutinaId: null, seguimientoId: null },
    });
    assert.equal((await ejecutarTarea(s.deps, C, huerfana)).estado, "review");
    assert.equal(s.llm.requests.length, 0);
  });

  it("un traspaso cuya cadena llega a un lead (evento externo) sí se ejecuta, y guarda la raíz", async () => {
    const s = setup([fin("Atendido.")]);
    const raiz = await nueva(s, EVENTO);
    const hija = await s.store.createTask(C, { agentId: lucia.id, title: "Traspaso", model: "claude-haiku-5-5", origen: { tipo: "traspaso", tareaPadreId: raiz }, instruccionEntrada: "Ficha del lead" });
    assert.equal((await s.store.getTask(C, hija))!.origen.tareaRaizId, raiz);
    assert.equal((await ejecutarTarea(s.deps, C, hija)).estado, "done");
  });

  it("validarCadena: la raíz tiene que ser evento, orden, rutina o seguimiento; un agente no se pasa trabajo a sí mismo", () => {
    const e = (nivel: number, agentId: string, origen: string | null, padre: string | null) => ({
      nivel, taskId: `t${nivel}`, agentId, origen: origen as never, tareaPadreId: padre, eventoId: null, sourceEmailId: null, ordenadoPor: "p", rutinaId: "r", seguimientoId: null,
      esSimulacion: false, ref: {}, title: "x", startedAt: "",
    });
    assert.equal(validarCadena([e(0, "b", "traspaso", "t1"), e(1, "a", "rutina_usuario", null)]), null);
    assert.equal(validarCadena([e(0, "b", "traspaso", "t1"), e(1, "a", "orden_usuario", null)]), null);
    assert.equal(validarCadena([e(0, "a", "traspaso", "t1"), e(1, "a", "evento_externo", null)])?.codigo, "cadena_invalida");
    assert.equal(validarCadena([e(0, "b", "traspaso", "t1")])?.codigo, "cadena_invalida");
  });
});

describe("sin autoencargos", () => {
  it("un agente no puede crearse una tarea a sí mismo: la base (y el almacén) lo rechazan", async () => {
    const s = setup();
    const raiz = await nueva(s, EVENTO);
    await assert.rejects(() => s.store.createTask(C, { agentId: sara.id, title: "Otra vez yo", model: "claude-haiku-5-5", origen: { tipo: "traspaso", tareaPadreId: raiz } }), /AUTOENCARGO/);
  });

  it("si el modelo intenta «programar» o «volver más tarde», la herramienta responde que no está permitido y no se crea ninguna tarea", async () => {
    const s = setup([
      llamada("t1", "programar_tarea", { cuando: "mañana", que: "volver a revisar" }),
      llamada("t2", "revisar_mas_tarde", {}),
      fin("Entendido: termino aquí."),
    ]);
    const id = await nueva(s, ORDEN_DE_PRUEBA);
    const r = await ejecutarTarea(s.deps, C, id, "Atiende al lead");
    assert.equal(r.estado, "done");
    const pasos = (await s.store.listSteps(C, id)).filter((p) => p.kind === "herramienta");
    assert.equal(pasos.length, 2);
    for (const p of pasos) assert.match(p.content, /No está permitido[\s\S]*proponer_seguimiento/);
    assert.equal(s.store.tasks.size, 1, "no se ha creado ninguna tarea más");
  });

  it("con el catálogo: crear tareas no existe, pasarse trabajo a sí mismo falla y proponer_seguimiento solo crea una aprobación", async () => {
    const s = setup();
    const almacen = new InMemoryAlmacenHerramientas();
    almacen.tools.push({ companyId: C, agentId: sara.id, toolId: "pasar_a_agente", permiso: "sola", limiteDiario: null });
    almacen.traspasos.push({ companyId: C, agentIdOrigen: sara.id, agenteDestinoId: sara.id, agenteDestinoNombre: "Sara", agenteDestinoSlug: sara.slug, condicion: "x", tipoTraspaso: "otro" });
    const taskId = await nueva(s, EVENTO);
    const ctx: ContextoEjecucion = {
      companyId: C, agent: sara, task: { id: taskId, contactId: null }, externalContent: false, memory: s.memory, contacts: s.memStore, store: s.store, sospechas: [],
      almacen, secretos: new GestorSecretos(C, async () => null), esSimulacion: false,
    };
    const crear = await ejecutarHerramienta(ctx, "crear_tarea", { agente: "Sara", que: "revisar mañana" });
    assert.equal(crear.estado, "bloqueada");
    assert.match(crear.texto, /No está permitido/);
    const yo = await ejecutarHerramienta(ctx, "pasar_a_agente", { agente_destino: "Sara", resumen: "a mí", ficha: { asunto: "a", detalle: "d" } });
    assert.ok(yo.error);
    assert.match(yo.texto, /No puedes pasarte trabajo a ti mismo/);
    assert.equal(almacen.traspasosCreados.length, 0);

    const seg = await ejecutarHerramienta(ctx, "proponer_seguimiento", { en_dias: 3, motivo: "No ha contestado", mensaje_previsto: "Hola de nuevo, ¿pudiste verlo?" });
    assert.equal(seg.estado, "ok");
    assert.match(seg.texto, /NO está programado/);
    assert.equal(almacen.seguimientos.length, 1);
    assert.equal(almacen.seguimientos[0].estado, "propuesto");
    assert.equal([...almacen.aprobaciones.values()].filter((a) => a.payload.tipo === "seguimiento").length, 1, "una aprobación para una persona");
    assert.equal(s.store.tasks.size, 1, "proponer no programa ninguna tarea");
    // Fuera de rango (o sin fecha): no se crea nada.
    const lejos = await ejecutarHerramienta(ctx, "proponer_seguimiento", { fecha: "2099-01-01T10:00:00+01:00", motivo: "x", mensaje_previsto: "y" });
    assert.ok(lejos.error);
    assert.equal(almacen.seguimientos.length, 1);
  });
});

describe("interruptores: AGENTES_ACTIVOS, parada de emergencia y oficina pausada", () => {
  it("AGENTES_ACTIVOS=false: no se ejecuta nada (un evento sigue en cola; una orden queda en revisión)", async () => {
    const s = setup([fin("no debería llegar")], { env: { AGENTES_ACTIVOS: "false" } });
    const ev = await s.store.createTask(C, { agentId: sara.id, title: "Lead", model: "claude-haiku-5-5", origen: EVENTO, instruccionEntrada: "Lead" });
    const r = await ejecutarTarea(s.deps, C, ev);
    assert.equal(r.estado, "bloqueada");
    assert.equal((await s.store.getTask(C, ev))!.status, "running", "sigue esperando para cuando se reactiven");
    const orden = await nueva(s, ORDEN_DE_PRUEBA);
    assert.equal((await ejecutarTarea(s.deps, C, orden, "Hazlo")).estado, "review");
    assert.equal(s.llm.requests.length, 0);
    assert.ok(s.store.bloqueos.every((b) => b.codigo === "agentes_desactivados"));
  });

  it("parada de emergencia: no empieza nada y la cola se detiene sin dar vueltas", async () => {
    const s = setup([fin("no debería llegar")]);
    s.store.control.paradaEmergencia = true;
    s.store.control.motivoParada = "Incidente";
    await s.store.createTask(C, { agentId: sara.id, title: "Lead", model: "claude-haiku-5-5", origen: EVENTO, instruccionEntrada: "Lead" });
    const r = await procesarTareasPendientes(s.deps, { log: { info: () => undefined, error: () => undefined } });
    assert.equal(r.ejecutadas, 0);
    assert.equal(s.llm.requests.length, 0);
  });

  it("la parada de emergencia detiene una tarea EN CURSO antes de su siguiente llamada al modelo", async () => {
    const s = setup();
    const guion = new ScriptedLlm([llamada("t1", "buscar_en_memoria", { consulta: "lead" }), fin("no debería llegar")]);
    // Al responder la primera vez, SAMGPLE activa la parada.
    const llm: LlmClient = { create: async (req) => { const r = await guion.create(req); s.store.control.paradaEmergencia = true; return r; } };
    const id = await nueva(s, EVENTO);
    const r = await ejecutarTarea({ ...s.deps, llm }, C, id, "Atiende el lead");
    assert.equal(r.estado, "review");
    assert.match(r.motivo ?? "", /Detenida antes de llamar al modelo: Parada de emergencia/);
    assert.equal(guion.requests.length, 1, "solo la primera llamada");
  });

  it("oficina pausada: ninguna tarea nueva empieza (el evento espera) y la cola no la ofrece", async () => {
    const s = setup([fin("no debería llegar")]);
    s.store.control.oficinaPausada = true;
    const ev = await s.store.createTask(C, { agentId: sara.id, title: "Lead", model: "claude-haiku-5-5", origen: EVENTO, instruccionEntrada: "Lead" });
    assert.equal((await ejecutarTarea(s.deps, C, ev)).estado, "bloqueada");
    assert.deepEqual(await s.store.listarTareasPendientes(), []);
    assert.equal(s.llm.requests.length, 0);
    // Al reanudar, se atiende.
    s.store.control.oficinaPausada = false;
    s.llm.script.splice(0, s.llm.script.length, fin("Atendido."));
    assert.equal((await procesarTareasPendientes(s.deps, { log: { info: () => undefined, error: () => undefined } })).ejecutadas, 1);
  });
});

describe("filtro de eventos (sin IA)", () => {
  it("detecta boletines, notificaciones, respuestas automáticas y rebotes; un correo normal pasa", () => {
    assert.equal(motivoCorreoAutomatico({ from: "news@tienda.es", subject: "Ofertas", headers: { "List-Unsubscribe": "<mailto:baja@tienda.es>" } }), "newsletter");
    assert.equal(motivoCorreoAutomatico({ from: "mailer-daemon@mx.example", subject: "Undelivered Mail Returned to Sender", headers: {} }), "rebote");
    assert.equal(motivoCorreoAutomatico({ from: "laura@clinica.es", subject: "Respuesta automática: fuera de la oficina", headers: {} }), "respuesta_automatica");
    assert.equal(motivoCorreoAutomatico({ from: "laura@clinica.es", subject: "Re: propuesta", headers: { "Auto-Submitted": "auto-replied" } }), "respuesta_automatica");
    assert.equal(motivoCorreoAutomatico({ from: "no-reply@banco.es", subject: "Su extracto", headers: {} }), "notificacion_automatica");
    assert.equal(motivoCorreoAutomatico({ from: "laura@clinica.es", subject: "Re: propuesta", headers: { "Message-ID": "<a@b>" } }), null);
  });

  it("descarta duplicados, agrupa ráfagas de la misma persona y pone en cola lo que pasa del límite por minuto", async () => {
    const ahora = new Date("2026-11-10T10:00:00Z");
    const vistos = new Set<string>();
    let pendiente: string | null = null;
    let aceptados = 0;
    const q: ConsultasFiltro = {
      existeClave: async (_c, _canal, clave) => vistos.has(clave),
      tareaPendienteDelRemitente: async (_c, h) => (h === huellaRemitente("laura@clinica.es") ? pendiente : null),
      ritmo: async () => ({ aceptados, limitePorMinuto: 2 }),
    };
    const ev = (clave: string, remitente = "laura@clinica.es") => ({ companyId: C, canal: "meta_lead" as const, clave, remitente });
    assert.equal((await decidirEvento(q, ev("lead-1"), ahora)).estado, "aceptado");
    vistos.add("lead-1");
    pendiente = "tarea-1";
    const dup = await decidirEvento(q, ev("lead-1"), ahora);
    assert.equal(dup.estado, "descartado");
    assert.equal(dup.estado === "descartado" && dup.codigo, "duplicado");
    assert.equal((await decidirEvento(q, ev("lead-2"), ahora)).estado, "agrupado");
    aceptados = 2;
    assert.equal((await decidirEvento(q, ev("lead-3", "otra@persona.es"), ahora)).estado, "en_cola");
    assert.equal((await decidirEvento(q, { ...ev("x"), automatico: "rebote" }, ahora)).estado, "descartado");
  });
});
