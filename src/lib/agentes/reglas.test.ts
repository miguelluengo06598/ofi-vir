/** Reglas de agente con fechas y horas SIMULADAS (nada de esperar tiempo real). Martes 10-nov-2026, hora de Madrid = UTC+1. */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { crearTarea, ejecutarTarea, type EngineDeps } from "../agents/loop.ts";
import { InMemoryAgentStore } from "../agents/inMemoryStore.ts";
import { fin, ScriptedLlm } from "../agents/scriptedLlm.ts";
import type { AgentInfo } from "../agents/store.ts";
import { FakeEmbedder } from "../memory/fakeEmbedder.ts";
import { InMemoryStore } from "../memory/inMemoryStore.ts";
import { createMemoryService } from "../memory/service.ts";
import type { ReglasAgente } from "./instrucciones.ts";
import { ejecutarHerramienta, GestorSecretos, obtenerHerramienta, resolverAprobacion, type ContextoEjecucion, type Permiso } from "./herramientas/index.ts";
import { InMemoryAlmacenHerramientas } from "./herramientas/inMemoryAlmacen.ts";
import { ORDEN_DE_PRUEBA } from "../agents/pruebas.ts";
import {
  crearServicioReglas, dentroDeHorario, componerMensaje, InMemoryAlmacenReglas, proximaApertura, reanudarAplazadas, REGLAS_POR_DEFECTO, tituloAvisoIa,
} from "./reglas/index.ts";

const C = "a64499d1-7f43-4a43-abc8-41a313dc4018";
const MARTES_23H = new Date("2026-11-10T22:00:00Z");      // martes 23:00 en Madrid (CET)
const MARTES_11H = new Date("2026-11-10T10:00:00Z");      // martes 11:00 en Madrid
const MIERCOLES_9H = new Date("2026-11-11T08:00:00Z");    // miércoles 09:00 en Madrid: abre
const PRICING = { inputEur: 0.092, outputEur: 0.46, cacheReadEur: 0.0092, cacheWriteEur: 0.115 };

const lucia: AgentInfo = {
  id: "ag-lucia", slug: "lucia-ramos", name: "Lucía Ramos", role: "Ventas", departmentId: "dep", departmentName: "Ventas",
  model: "claude-haiku-5-5", instructions: "Eres Lucía.", allowedTools: ["buscar_en_memoria"],
};
const reglas = (o: Partial<ReglasAgente> = {}): ReglasAgente => ({ ...REGLAS_POR_DEFECTO, ...o });
const MENSAJE_EXTERNO = 'Responde a este cliente.\n<contenido_externo origen="whatsapp">Hola, ¿cuánto cuesta el plan Pro?</contenido_externo>';

describe("horario con fechas simuladas", () => {
  it("el martes a las 23:00 (Madrid) está fuera de horario; a las 11:00, dentro", () => {
    assert.equal(new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Madrid", weekday: "long" }).format(MARTES_23H), "Tuesday");
    assert.equal(dentroDeHorario(REGLAS_POR_DEFECTO.horario, "Europe/Madrid", MARTES_23H), false);
    assert.equal(dentroDeHorario(REGLAS_POR_DEFECTO.horario, "Europe/Madrid", MARTES_11H), true);
  });
  it("la próxima apertura: al día siguiente, tras el fin de semana, con cambio de hora y con franjas partidas", () => {
    const h = REGLAS_POR_DEFECTO.horario;
    assert.equal(proximaApertura(h, "Europe/Madrid", MARTES_23H)!.toISOString(), "2026-11-11T08:00:00.000Z");
    assert.equal(proximaApertura(h, "Europe/Madrid", new Date("2026-11-13T18:30:00Z"))!.toISOString(), "2026-11-16T08:00:00.000Z", "viernes 19:30 → lunes 09:00");
    // El 25-oct-2026 acaba el horario de verano: el lunes 26 a las 09:00 ya es CET (UTC+1), no CEST.
    assert.equal(proximaApertura(h, "Europe/Madrid", new Date("2026-10-24T12:00:00Z"))!.toISOString(), "2026-10-26T08:00:00.000Z");
    const partido = { mar: [["09:00", "14:00"], ["16:00", "19:00"]] as [string, string][] };
    assert.equal(proximaApertura(partido, "Europe/Madrid", new Date("2026-11-10T14:30:00Z"))!.toISOString(), "2026-11-10T15:00:00.000Z", "15:30 → 16:00 el mismo día");
    assert.equal(proximaApertura({}, "Europe/Madrid", MARTES_23H), null);
  });
  it("respeta la zona horaria del agente (Canarias va una hora por detrás)", () => {
    assert.equal(dentroDeHorario(REGLAS_POR_DEFECTO.horario, "Atlantic/Canary", new Date("2026-11-10T17:30:00Z")), true);
    assert.equal(dentroDeHorario(REGLAS_POR_DEFECTO.horario, "Europe/Madrid", new Date("2026-11-10T17:30:00Z")), false);
  });
});

function motor(script: ReturnType<typeof fin>[], r: ReglasAgente | null, relojActual: { t: Date }, over: Partial<EngineDeps> = {}) {
  const store = new InMemoryAgentStore();
  store.agents = [lucia];
  store.pricing.set("claude-haiku-5-5", PRICING);
  const memStore = new InMemoryStore();
  const memory = createMemoryService({ store: memStore, embedder: new FakeEmbedder() });
  const almacen = new InMemoryAlmacenReglas();
  almacen.ahora = () => relojActual.t;
  if (r) almacen.reglas.set(lucia.id, r);
  const llm = new ScriptedLlm(script);
  const servicio = crearServicioReglas({ almacen, memory, memStore });
  const deps: EngineDeps = { store, memory, contacts: memStore, llm, aprender: false, reglas: servicio, ahora: () => relojActual.t, ...over };
  return { store, memory, memStore, almacen, llm, deps, servicio };
}
const lanzar = async (m: ReturnType<typeof motor>, instruccion: string) => {
  const id = await crearTarea(m.deps, C, { origen: ORDEN_DE_PRUEBA, agentSlug: "lucia-ramos", title: "Mensaje" });
  return { id, r: await ejecutarTarea(m.deps, C, id, instruccion) };
};

describe("al lanzar la tarea: horario (martes 23:00)", () => {
  it("«responder_normal»: se lanza sin cambios", async () => {
    const m = motor([fin("hecho")], reglas({ fueraDeHorario: "responder_normal" }), { t: MARTES_23H });
    assert.equal((await lanzar(m, MENSAJE_EXTERNO)).r.estado, "done");
    assert.match(String(m.llm.requests[0].system), /FUERA del horario de atención: responde con normalidad/);
    assert.doesNotMatch(String(m.llm.requests[0].system), /una persona del equipo lo revisará/);
  });
  it("«responder_y_avisar»: se lanza y el agente sabe que está fuera de horario y qué mensaje dar", async () => {
    const m = motor([fin("hecho")], reglas({ fueraDeHorario: "responder_y_avisar", mensajeFueraHorario: "Te contestamos mañana a partir de las 9" }), { t: MARTES_23H });
    assert.equal((await lanzar(m, MENSAJE_EXTERNO)).r.estado, "done");
    const sistema = String(m.llm.requests[0].system);
    assert.match(sistema, /FUERA del horario de atención/);
    assert.match(sistema, /Te contestamos mañana a partir de las 9/);
  });
  it("«no_responder»: NO se llama al modelo; el mensaje se guarda y se procesa al abrir", async () => {
    const m = motor([fin("Contestado al abrir")], reglas({ fueraDeHorario: "no_responder" }), { t: MARTES_23H });
    const { id, r } = await lanzar(m, MENSAJE_EXTERNO);
    assert.equal(r.estado, "scheduled");
    assert.equal(m.llm.requests.length, 0, "ninguna llamada al modelo");
    assert.equal((await m.store.getTask(C, id))!.status, "scheduled");
    assert.equal(m.store.aplazadas.get(id)!.hasta.toISOString(), "2026-11-11T08:00:00.000Z");
    assert.match(m.store.aplazadas.get(id)!.instruccion!, /plan Pro/, "el mensaje queda guardado");

    // Una hora después sigue cerrado: no se procesa nada.
    const antes = await reanudarAplazadas(m.deps, new Date("2026-11-10T23:00:00Z"));
    assert.equal(antes.vencidas, 0);
    assert.equal(m.llm.requests.length, 0);

    // Miércoles 09:00: abre y se procesa, con el mensaje guardado; y solo una vez.
    const al_abrir = await reanudarAplazadas(m.deps, MIERCOLES_9H);
    assert.deepEqual([al_abrir.vencidas, al_abrir.reanudadas, al_abrir.errores], [1, 1, 0]);
    assert.equal(al_abrir.resultados[0].estado, "done");
    assert.equal((await m.store.getTask(C, id))!.status, "done");
    assert.equal(m.llm.requests.length, 1);
    assert.match(JSON.stringify(m.llm.requests[0].messages), /plan Pro/);
    assert.equal((await reanudarAplazadas(m.deps, MIERCOLES_9H)).vencidas, 0, "no se procesa dos veces");
  });
  it("«no_responder» solo frena mensajes de personas de fuera: una tarea interna sí se ejecuta", async () => {
    const m = motor([fin("informe listo")], reglas({ fueraDeHorario: "no_responder" }), { t: MARTES_23H });
    assert.equal((await lanzar(m, "Resume las campañas de la semana.")).r.estado, "done");
  });
  it("dentro de horario, «no_responder» se lanza con normalidad", async () => {
    const m = motor([fin("hecho")], reglas({ fueraDeHorario: "no_responder" }), { t: MARTES_11H });
    assert.equal((await lanzar(m, MENSAJE_EXTERNO)).r.estado, "done");
  });
  it("sin fila de reglas se usan las de por defecto (L-V 9-18, responder y avisar)", async () => {
    const m = motor([fin("hecho")], null, { t: MARTES_23H });
    assert.equal((await lanzar(m, MENSAJE_EXTERNO)).r.estado, "done");
    assert.match(String(m.llm.requests[0].system), /FUERA del horario/);
  });
});

describe("al lanzar la tarea: tope de créditos del mes por agente", () => {
  it("con el tope alcanzado no se llama al modelo, la tarea queda en revisión y se avisa UNA vez a la empresa; el mes siguiente se reanuda", async () => {
    const reloj = { t: new Date("2026-11-20T10:00:00Z") };
    const m = motor([fin("hecho")], reglas({ topeCreditosMes: 100, horario: {} }), reloj);
    m.almacen.consumo.push({ companyId: C, agentId: lucia.id, creditos: 60, fecha: new Date("2026-11-03T10:00:00Z") }, { companyId: C, agentId: lucia.id, creditos: 40, fecha: new Date("2026-11-15T10:00:00Z") });
    m.almacen.consumo.push({ companyId: C, agentId: lucia.id, creditos: 500, fecha: new Date("2026-10-30T10:00:00Z") });   // del mes pasado: no cuenta
    const a = await lanzar(m, "Tarea interna.");
    assert.equal(a.r.estado, "review");
    assert.match(a.r.motivo!, /tope de 100 créditos/);
    assert.equal(m.llm.requests.length, 0);
    await lanzar(m, "Otra tarea.");
    assert.equal(m.almacen.avisos.filter((x) => x.tipo === "tope_creditos_agente").length, 1, "un solo aviso al mes");
    // 1 de diciembre: el consumo de noviembre ya no cuenta.
    reloj.t = new Date("2026-12-01T10:00:00Z");
    assert.equal((await lanzar(m, "Tarea de diciembre.")).r.estado, "done");
  });
  it("por debajo del tope se ejecuta", async () => {
    const m = motor([fin("hecho")], reglas({ topeCreditosMes: 100, horario: {} }), { t: MARTES_11H });
    m.almacen.consumo.push({ companyId: C, agentId: lucia.id, creditos: 99, fecha: new Date("2026-11-02T10:00:00Z") });
    assert.equal((await lanzar(m, "Tarea.")).r.estado, "done");
  });
});

// ── Ejecutor de herramientas ─────────────────────────────────────────────────────────────────────────────────
async function ejecutor(r: ReglasAgente, permisos: Record<string, Permiso> = { responder_whatsapp: "sola", redactar_correo: "sola" }, reloj = { t: MARTES_11H }) {
  const store = new InMemoryAgentStore();
  store.agents = [lucia];
  const memStore = new InMemoryStore();
  const memory = createMemoryService({ store: memStore, embedder: new FakeEmbedder() });
  const almacen = new InMemoryAlmacenHerramientas();
  almacen.ahora = () => reloj.t;
  almacen.conexiones.push({ companyId: C, proveedor: "whatsapp" });
  for (const [toolId, permiso] of Object.entries(permisos)) almacen.tools.push({ companyId: C, agentId: lucia.id, toolId, permiso, limiteDiario: null });
  const reglasAlm = new InMemoryAlmacenReglas();
  reglasAlm.ahora = () => reloj.t;
  reglasAlm.reglas.set(lucia.id, r);
  const servicio = crearServicioReglas({ almacen: reglasAlm, memory, memStore });
  // Un contacto conocido.
  const g = await memory.guardarRecuerdo(C, { agentId: lucia.id, contacto: { nombre: "Laura Gómez", email: "laura@clinicasol.example" }, nodos: [{ clave: "a", tipo: "dato", titulo: "Pidió precios", contenido: "" }], conexiones: [] });
  const contactId = g.contacto!.id;
  const taskId = await store.createTask(C, { origen: ORDEN_DE_PRUEBA, agentId: lucia.id, title: "Tarea", model: "claude-haiku-5-5", contactId });
  // WhatsApp todavía no tiene integración real: aquí se sustituye por una que deja constancia de lo que SE ENVIARÍA.
  const enviados: string[] = [];
  const wa = obtenerHerramienta("responder_whatsapp")!;
  const original = wa.ejecutar;
  wa.ejecutar = async (_ctx, e) => { enviados.push((e as { mensaje: string }).mensaje); return { enviado: true, mensaje: "ok" }; };
  const ctx = (over: Partial<ContextoEjecucion> = {}): ContextoEjecucion => ({
    companyId: C, agent: lucia, task: { id: taskId, contactId }, externalContent: true, memory, contacts: memStore, store, sospechas: [], almacen,
    secretos: new GestorSecretos(C, async () => null), esSimulacion: false, ahora: () => reloj.t, reglas: servicio.reglasDelEjecutor(), ...over,
  });
  return { store, memory, memStore, almacen, reglasAlm, enviados, ctx, contactId, reloj, restaurar: () => { wa.ejecutar = original; } };
}
const wa = (mensaje: string) => ({ telefono: "+34600111222", mensaje });
const nodosAviso = async (e: Awaited<ReturnType<typeof ejecutor>>, canal: "whatsapp" | "correo") =>
  (await e.memStore.listContactNodes(C, e.contactId)).filter((n) => n.title === tituloAvisoIa(canal));

describe("ejecutor: límite diario de mensajes externos (WhatsApp + correo)", () => {
  it("al llegar al límite, lo siguiente pasa a aprobación y se avisa a la empresa (una vez al día); al día siguiente vuelve a ir solo", async () => {
    const e = await ejecutor(reglas({ maxMensajesDia: 2, avisoIaTexto: "IA" }));
    try {
      assert.equal((await ejecutarHerramienta(e.ctx(), "responder_whatsapp", wa("Uno"))).estado, "ok");
      // El segundo mensaje va por OTRO canal: el límite cuenta WhatsApp + correo.
      const c = await ejecutarHerramienta(e.ctx(), "redactar_correo", { correo_del_contacto: "laura@clinicasol.example", asunto: "Hola", cuerpo: "Dos" });
      assert.equal(c.estado, "ok", c.texto);
      assert.equal(e.store.drafts.length, 1, "el correo es un borrador que ya lleva su propia aprobación");

      const tercero = await ejecutarHerramienta(e.ctx(), "responder_whatsapp", wa("Tres"));
      assert.equal(tercero.estado, "pendiente_aprobacion");
      assert.equal(e.enviados.length, 1, "el tercero NO se envía");
      assert.match([...e.almacen.aprobaciones.values()].at(-1)!.detalle, /Límite diario alcanzado/);
      assert.equal(e.reglasAlm.avisos.length, 1);
      assert.equal(e.reglasAlm.avisos[0].tipo, "limite_mensajes_agente");

      assert.equal((await ejecutarHerramienta(e.ctx(), "responder_whatsapp", wa("Cuatro"))).estado, "pendiente_aprobacion");
      assert.equal(e.reglasAlm.avisos.length, 1, "un solo aviso por día");

      // Una persona aprueba el tercero: sale (el límite no frena lo que ya aprobó una persona).
      const [id, ap] = [...e.almacen.aprobaciones.entries()].filter(([, a]) => /whatsapp/i.test(JSON.stringify(a.payload)))[0];
      ap.status = "approved";
      assert.equal((await resolverAprobacion(e.ctx(), id)).estado, "ok");
      assert.equal(e.enviados.length, 2);

      // Miércoles: contador nuevo.
      e.reloj.t = new Date("2026-11-11T10:00:00Z");
      assert.equal((await ejecutarHerramienta(e.ctx(), "responder_whatsapp", wa("Del miércoles"))).estado, "ok");
    } finally { e.restaurar(); }
  });
  it("sin límite configurado no frena nada", async () => {
    const e = await ejecutor(reglas({ maxMensajesDia: null }));
    try {
      for (let i = 0; i < 5; i++) assert.equal((await ejecutarHerramienta(e.ctx(), "responder_whatsapp", wa(`Mensaje ${i}`))).estado, "ok");
    } finally { e.restaurar(); }
  });
});

describe("ejecutor: aviso de IA (solo la primera vez por persona y canal)", () => {
  it("el primer mensaje lleva el aviso configurado, se guarda en la memoria, y el segundo ya no lo lleva", async () => {
    const e = await ejecutor(reglas({ avisoIaTexto: "Soy Sara, asistente de IA de Clínica Sol." }));
    try {
      await ejecutarHerramienta(e.ctx(), "responder_whatsapp", wa("Hola Laura, ¿en qué te ayudo?"));
      assert.equal(e.enviados[0], "Soy Sara, asistente de IA de Clínica Sol.\n\nHola Laura, ¿en qué te ayudo?");
      assert.equal((await nodosAviso(e, "whatsapp")).length, 1, "constancia en la memoria");
      assert.match((await nodosAviso(e, "whatsapp"))[0].content, /asistente de IA por WhatsApp/);

      await ejecutarHerramienta(e.ctx(), "responder_whatsapp", wa("Te paso el precio."));
      assert.equal(e.enviados[1], "Te paso el precio.", "la segunda vez, sin aviso");
      assert.equal((await nodosAviso(e, "whatsapp")).length, 1, "no se duplica");
    } finally { e.restaurar(); }
  });
  it("el aviso es por canal: tras avisar por WhatsApp, el primer correo lo vuelve a llevar", async () => {
    const e = await ejecutor(reglas({ avisoIaTexto: "Soy un asistente de IA." }));
    try {
      await ejecutarHerramienta(e.ctx(), "responder_whatsapp", wa("Hola"));
      await ejecutarHerramienta(e.ctx(), "redactar_correo", { correo_del_contacto: "laura@clinicasol.example", asunto: "Tu consulta", cuerpo: "Te escribo por correo." });
      assert.match(e.store.drafts.at(-1)!.body, /^Soy un asistente de IA\.\n\nTe escribo por correo\./);
      await ejecutarHerramienta(e.ctx(), "redactar_correo", { correo_del_contacto: "laura@clinicasol.example", asunto: "Otra", cuerpo: "Segundo correo." });
      assert.equal(e.store.drafts.at(-1)!.body, "Segundo correo.");
      assert.equal((await nodosAviso(e, "correo")).length, 1);
    } finally { e.restaurar(); }
  });
  it("sin aviso configurado se usa el de por defecto, y si la IA ya lo escribió no se repite", async () => {
    const e = await ejecutor(reglas({ avisoIaTexto: null }));
    try {
      await ejecutarHerramienta(e.ctx(), "responder_whatsapp", wa("Hola"));
      assert.match(e.enviados[0], /^Soy un asistente de inteligencia artificial\./);
      const f = await ejecutor(reglas({ avisoIaTexto: "Soy un asistente de IA." }));
      await ejecutarHerramienta(f.ctx(), "responder_whatsapp", wa("Soy un asistente de IA. ¿Qué necesitas?"));
      assert.equal(f.enviados[0], "Soy un asistente de IA. ¿Qué necesitas?", "sin duplicar");
    } finally { e.restaurar(); }
  });
  it("si el mensaje queda pendiente de aprobación, el aviso se anota solo cuando SALE; lo que ve la persona que aprueba ya lleva el aviso", async () => {
    const e = await ejecutor(reglas({ avisoIaTexto: "Soy IA de Clínica Sol." }), { responder_whatsapp: "aprobacion" });
    try {
      const r = await ejecutarHerramienta(e.ctx(), "responder_whatsapp", wa("Hola"));
      assert.equal(r.estado, "pendiente_aprobacion");
      assert.match([...e.almacen.aprobaciones.values()][0].detalle, /Soy IA de Clínica Sol\./);
      assert.equal((await nodosAviso(e, "whatsapp")).length, 0, "aún no ha salido");
      const [id, ap] = [...e.almacen.aprobaciones.entries()][0];
      ap.status = "approved";
      assert.equal((await resolverAprobacion(e.ctx(), id)).estado, "ok");
      assert.equal(e.enviados[0], "Soy IA de Clínica Sol.\n\nHola", "sin duplicar el aviso al ejecutar lo aprobado");
      assert.equal((await nodosAviso(e, "whatsapp")).length, 1);
    } finally { e.restaurar(); }
  });
  it("los avisos de una persona no cuentan para otra", async () => {
    const e = await ejecutor(reglas({ avisoIaTexto: "IA." }));
    try {
      await ejecutarHerramienta(e.ctx(), "responder_whatsapp", wa("Hola Laura"));
      const otra = await e.memory.guardarRecuerdo(C, { agentId: lucia.id, contacto: { nombre: "Pedro", email: "pedro@x.example" }, nodos: [{ clave: "a", tipo: "dato", titulo: "Nuevo", contenido: "" }], conexiones: [] });
      await ejecutarHerramienta(e.ctx({ task: { id: "", contactId: otra.contacto!.id } }), "responder_whatsapp", wa("Hola Pedro"));
      assert.match(e.enviados[1], /^IA\.\n\nHola Pedro/);
    } finally { e.restaurar(); }
  });
});

describe("ejecutor: horario (martes 23:00)", () => {
  const prueba = async (r: Partial<ReglasAgente>) => {
    const e = await ejecutor(reglas({ avisoIaTexto: "IA.", ...r }), { responder_whatsapp: "sola" }, { t: MARTES_23H });
    try { return { e, res: await ejecutarHerramienta(e.ctx(), "responder_whatsapp", wa("Hola")), enviados: e.enviados }; } finally { e.restaurar(); }
  };
  it("«responder_y_avisar»: responde y añade el mensaje configurado", async () => {
    const { res, enviados } = await prueba({ fueraDeHorario: "responder_y_avisar", mensajeFueraHorario: "Te contestamos mañana a partir de las 9" });
    assert.equal(res.estado, "ok");
    assert.equal(enviados[0], "IA.\n\nHola\n\nTe contestamos mañana a partir de las 9");
  });
  it("«no_responder»: el ejecutor no deja salir nada fuera de horario", async () => {
    const { res, enviados } = await prueba({ fueraDeHorario: "no_responder" });
    assert.equal(res.estado, "bloqueada");
    assert.match(res.texto, /Fuera de horario/);
    assert.equal(enviados.length, 0);
  });
  it("«responder_normal»: sin cambios (ni mensaje de horario)", async () => {
    const { res, enviados } = await prueba({ fueraDeHorario: "responder_normal", mensajeFueraHorario: "Te contestamos mañana" });
    assert.equal(res.estado, "ok");
    assert.equal(enviados[0], "IA.\n\nHola");
  });
  it("dentro de horario no se añade el mensaje de fuera de horario", async () => {
    const e = await ejecutor(reglas({ avisoIaTexto: "IA.", mensajeFueraHorario: "Mañana" }), { responder_whatsapp: "sola" }, { t: MARTES_11H });
    try { await ejecutarHerramienta(e.ctx(), "responder_whatsapp", wa("Hola")); assert.equal(e.enviados[0], "IA.\n\nHola"); } finally { e.restaurar(); }
  });
  it("una tarea interna (sin mensaje de fuera) no se ve afectada por el horario", async () => {
    const e = await ejecutor(reglas({ avisoIaTexto: "IA.", fueraDeHorario: "no_responder" }), { responder_whatsapp: "sola" }, { t: MARTES_23H });
    try { assert.equal((await ejecutarHerramienta(e.ctx({ externalContent: false }), "responder_whatsapp", wa("Aviso"))).estado, "ok"); } finally { e.restaurar(); }
  });
});

describe("ejecutor: tope de créditos del mes", () => {
  it("con el tope alcanzado bloquea las herramientas que cuestan créditos, pero no las gratuitas", async () => {
    const e = await ejecutor(reglas({ topeCreditosMes: 50 }), { responder_whatsapp: "sola", buscar_en_memoria: "sola" });
    try {
      e.reglasAlm.consumo.push({ companyId: C, agentId: lucia.id, creditos: 50, fecha: new Date("2026-11-02T10:00:00Z") });
      const r = await ejecutarHerramienta(e.ctx(), "responder_whatsapp", wa("Hola"));
      assert.equal(r.estado, "bloqueada");
      assert.match(r.texto, /tope de créditos/);
      assert.equal(e.enviados.length, 0);
      assert.equal((await ejecutarHerramienta(e.ctx(), "buscar_en_memoria", { consulta: "Laura" })).estado, "ok");
      assert.equal(e.reglasAlm.avisos.filter((a) => a.tipo === "tope_creditos_agente").length, 1);
    } finally { e.restaurar(); }
  });
});

describe("componerMensaje", () => {
  it("es idempotente y no distingue mayúsculas ni tildes", () => {
    const a = componerMensaje("Hola", { avisoIa: "Soy un asistente de IA.", fueraHorario: "Te contestamos mañana" });
    assert.equal(a.texto, "Soy un asistente de IA.\n\nHola\n\nTe contestamos mañana");
    const b = componerMensaje(a.texto.toUpperCase(), { avisoIa: "Soy un asistente de IA.", fueraHorario: "Te contestamos mañana" });
    assert.equal(b.aviso || b.fuera, false);
  });
});

describe("idioma en las instrucciones", () => {
  it("por defecto sigue el idioma del mensaje; si la empresa lo fija, siempre ese", async () => {
    const { textoReglasActivas } = await import("./instrucciones.ts");
    assert.match(textoReglasActivas(reglas({ idioma: "auto" }), MARTES_11H), /mismo idioma en que te escribe/);
    assert.match(textoReglasActivas(reglas({ idioma: "en" }), MARTES_11H), /responde siempre en inglés, aunque la persona escriba en otro idioma/);
  });
});
