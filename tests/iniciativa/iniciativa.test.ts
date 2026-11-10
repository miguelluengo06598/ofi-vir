/**
 * «Los agentes nunca trabajan por iniciativa propia» contra la base LOCAL real (motor, ejecutor, filtro, rutinas, disparadores SQL).
 * El modelo es un guion (ScriptedLlm): lo real es la base, el motor, la puerta de ejecución y las comprobaciones de la base.
 * Ejecutar: npm run test:iniciativa (con `supabase start` y la base al día: `npm run db:reset`).
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, describe, it } from "node:test";
import { ejecutarTarea, type EngineDeps } from "../../src/lib/agents/loop.ts";
import { fin, llamada, ScriptedLlm } from "../../src/lib/agents/scriptedLlm.ts";
import { SupabaseAgentStore } from "../../src/lib/agents/supabaseStore.ts";
import { SupabaseAlmacenHerramientas } from "../../src/lib/agentes/herramientas/supabaseAlmacen.ts";
import { GestorSecretos } from "../../src/lib/agentes/herramientas/tipos.ts";
import { procesarTareasPendientes } from "../../src/lib/agentes/traspasos/procesar.ts";
import { ejecutarRutinasVencidas } from "../../src/lib/creditos/rutinas.ts";
import { crearServicioCreditos } from "../../src/lib/creditos/servicio.ts";
import { procesarCorreoRecibido, type InboundEvent } from "../../src/lib/email/inbound.ts";
import { SupabaseEmailStore } from "../../src/lib/email/supabaseStore.ts";
import { recibirEvento, SupabaseAlmacenEventos } from "../../src/lib/eventos/servicio.ts";
import { FakeEmbedder } from "../../src/lib/memory/fakeEmbedder.ts";
import { createMemoryService } from "../../src/lib/memory/service.ts";
import { SupabaseMemoryStore } from "../../src/lib/memory/supabaseStore.ts";
import { pausaPostHandler } from "../../src/lib/oficina/api.ts";
import { clienteLocal } from "../ayuda/clienteLocal.ts";
import { altaEnEmpresa } from "../ayuda/miembros.ts";
import { sesionDePrueba } from "../../src/lib/empresas/pruebas.ts";

const { db } = clienteLocal();
const creditos = crearServicioCreditos({ db, esLocal: true });
const RUN = Date.now().toString(36);
const silencio = { info: () => undefined, warn: () => undefined, error: () => undefined };
const usuarios: string[] = [];
after(async () => {
  await db.from("plataforma_control").update({ parada_emergencia: false, motivo: null }).eq("id", true);
  for (const id of usuarios) await db.auth.admin.deleteUser(id).catch(() => undefined);
});

type Ag = { id: string; slug: string; name: string; model: string };
async function oficina() {
  const companyId = randomUUID(), departmentId = randomUUID();
  assert.ifError((await db.from("companies").insert({ id: companyId, name: `test-iniciativa ${RUN}` })).error);
  assert.ifError((await db.from("departments").insert({ id: departmentId, company_id: companyId, name: "Ventas", slug: `ventas-${randomUUID().slice(0, 6)}` })).error);
  const persona = async (role: "owner" | "member") => {
    const email = `iniciativa-${role}-${randomUUID().slice(0, 8)}@test.example`;
    const { data, error } = await db.auth.admin.createUser({ email, password: `Pw-${randomUUID()}-Aa1!`, email_confirm: true });
    assert.ifError(error);
    usuarios.push(data.user!.id);
    assert.ifError((await altaEnEmpresa(db, { id: data.user!.id, companyId, nombre: role === "owner" ? "Miguel Prueba" : "Ana Miembro", email, rol: role })).error);
    return data.user!.id;
  };
  const duena = await persona("owner"), miembro = await persona("member");
  const ags: Ag[] = [];
  for (const name of ["Sara", "Lucía"]) {
    const a = { id: randomUUID(), slug: `${name.toLowerCase().normalize("NFD").replace(/[^a-z]/g, "")}-${randomUUID().slice(0, 6)}`, name, model: "claude-haiku-5-5" };
    assert.ifError((await db.from("agents").insert({ id: a.id, company_id: companyId, department_id: departmentId, slug: a.slug, name, role: "Prueba", creator_name: "IDESIE", model: a.model })).error);
    assert.ifError((await db.from("agent_tools").insert([{ agent_id: a.id, company_id: companyId, tool_id: "pasar_a_agente", permiso: "sola" }])).error);
    ags.push(a);
  }
  assert.ifError((await db.from("agent_handoffs").insert({ company_id: companyId, agent_id_origen: ags[0].id, agent_id_destino: ags[1].id, condicion: "piden presupuesto", tipo_traspaso: "lead" })).error);
  await creditos.anadirCreditos(companyId, "prueba", "prueba", null, `test-iniciativa:${companyId}`);
  return { companyId, sara: ags[0], lucia: ags[1], duena, miembro };
}
function motor(script: ReturnType<typeof fin>[], over: Partial<EngineDeps> = {}) {
  const store = new SupabaseAgentStore(db);
  const memStore = new SupabaseMemoryStore(db);
  const llm = new ScriptedLlm(script);
  const deps: EngineDeps = {
    store, memory: createMemoryService({ store: memStore, embedder: new FakeEmbedder() }), contacts: memStore, llm, aprender: false, env: {},
    catalogo: { almacen: new SupabaseAlmacenHerramientas(db, creditos), secretos: (c) => new GestorSecretos(c, async () => null) }, ...over,
  };
  return { store, llm, deps };
}
const tareas = async (companyId: string) => ((await db.from("tasks").select("*").eq("company_id", companyId).order("started_at")).data ?? []) as Record<string, unknown>[];
const eventos = async (companyId: string) => ((await db.from("eventos_externos").select("*").eq("company_id", companyId).order("recibido_en")).data ?? []) as Record<string, unknown>[];
const saldo = async (companyId: string) => (await creditos.obtenerSaldo(companyId)).disponible;
const correo = (o: { de: string; asunto: string; texto: string; cabeceras?: Record<string, string> }): InboundEvent => {
  const id = `<${randomUUID()}@correo.example>`;
  return { type: "email.received", data: { email_id: randomUUID(), from: o.de, to: ["ventas@empresa.example"], subject: o.asunto, text: o.texto, message_id: id, headers: { "Message-ID": id, ...o.cabeceras }, created_at: new Date().toISOString() } };
};
const entrada = (companyId: string, agentSlug: string) => ({
  store: new SupabaseEmailStore(db), fetcher: null, defaultCompanyId: companyId, defaultAgentSlug: agentSlug, alGuardar: async () => undefined, eventos: new SupabaseAlmacenEventos(db),
});
const FICHA = { nombre: "Laura Gómez", contacto: "laura@clinica.example", interes: "Presupuesto de implantes", urgencia: "alta" };

describe("los agentes solo trabajan con un motivo (base real)", () => {
  it("un lead que entra por el webhook de correo se atiende solo y puede pasar a otro agente; la cadena guarda su raíz", async () => {
    const o = await oficina();
    const r = await procesarCorreoRecibido(entrada(o.companyId, o.sara.slug), correo({ de: "Laura Gómez <laura@clinica.example>", asunto: "Presupuesto de implantes", texto: "Hola, ¿cuánto cuesta un implante?" }));
    assert.equal(r.estado, "guardado");
    const m = motor([
      llamada("t1", "pasar_a_agente", { agente_destino: "Lucía", resumen: "Laura quiere presupuesto de implantes", ficha: FICHA }), fin("Pasado a Lucía."),
      fin("Lucía: preparo la propuesta."),
    ]);
    const cola = await procesarTareasPendientes(m.deps, { companyId: o.companyId, log: silencio });
    assert.equal(cola.ejecutadas, 2, "Sara y después Lucía, sin que nadie las lance a mano");
    const [t1, t2] = await tareas(o.companyId);
    assert.equal(t1.origen, "evento_externo");
    assert.ok(t1.source_email_id && t1.evento_id, "el evento y el correo quedan referenciados");
    assert.equal(t1.status, "done");
    assert.equal(t2.origen, "traspaso");
    assert.equal(t2.tarea_padre_id, t1.id);
    assert.equal(t2.tarea_raiz_id, t1.id, "la raíz de la cadena es el correo que llegó");
    assert.equal(t2.status, "done");
    const { data: cadena } = await db.rpc("tarea_cadena", { p_company_id: o.companyId, p_task_id: t2.id });
    assert.deepEqual((cadena as { origen: string }[]).map((c) => c.origen), ["traspaso", "evento_externo"]);
    // La cadena termina cuando el último agente no pasa el trabajo a nadie: no queda nada pendiente.
    assert.equal((await procesarTareasPendientes(m.deps, { companyId: o.companyId, log: silencio })).ejecutadas, 0);
  });

  it("un lead de formulario (evento genérico) crea su tarea con origen evento_externo y se atiende", async () => {
    const o = await oficina();
    const store = new SupabaseAgentStore(db);
    const res = await recibirEvento({ eventos: new SupabaseAlmacenEventos(db), store }, {
      companyId: o.companyId, canal: "formulario", clave: `form-${randomUUID()}`, remitente: "pedro@cliente.example", agentId: o.sara.id, model: o.sara.model,
      titulo: "Lead del formulario", contenido: "Nombre: Pedro. Quiero información de ortodoncia.",
    });
    assert.equal(res.decision.estado, "aceptado");
    const m = motor([fin("Respondido.")]);
    assert.equal((await procesarTareasPendientes(m.deps, { companyId: o.companyId, log: silencio })).ejecutadas, 1);
    assert.match(String(m.llm.requests[0].messages[0].content), /<contenido_externo origen="formulario">/, "el contenido va delimitado como externo");
  });

  it("una newsletter, un rebote y un lead duplicado NO lanzan ningún agente ni gastan créditos (queda el motivo)", async () => {
    const o = await oficina();
    const antes = await saldo(o.companyId);
    const e = entrada(o.companyId, o.sara.slug);
    const news = await procesarCorreoRecibido(e, correo({ de: "Tienda <news@tienda.example>", asunto: "Ofertas de noviembre", texto: "…", cabeceras: { "List-Unsubscribe": "<mailto:baja@tienda.example>" } }));
    const rebote = await procesarCorreoRecibido(e, correo({ de: "MAILER-DAEMON@mx.example", asunto: "Undelivered Mail Returned to Sender", texto: "…" }));
    assert.equal(news.estado, "descartado");
    assert.equal(rebote.estado, "descartado");
    const store = new SupabaseAgentStore(db);
    const lead = { companyId: o.companyId, canal: "meta_lead" as const, clave: `meta-${randomUUID()}`, remitente: "+34600111222", agentId: o.sara.id, model: o.sara.model, titulo: "Lead de Meta", contenido: "Interesada en blanqueamiento" };
    assert.equal((await recibirEvento({ eventos: new SupabaseAlmacenEventos(db), store }, lead)).decision.estado, "aceptado");
    const dup = await recibirEvento({ eventos: new SupabaseAlmacenEventos(db), store }, { ...lead, remitente: "+34 600 111 222 " });
    assert.equal(dup.decision.estado, "descartado");
    assert.equal(dup.taskId, null);

    const ts = await tareas(o.companyId);
    assert.equal(ts.length, 1, "solo el primer lead tiene tarea");
    const evs = await eventos(o.companyId);
    const motivos = evs.filter((x) => x.estado === "descartado").map((x) => String(x.motivo));
    assert.equal(motivos.length, 3);
    assert.ok(motivos.some((x) => /Boletín/.test(x)) && motivos.some((x) => /Rebote/.test(x)) && motivos.some((x) => /duplicado/.test(x)));
    assert.equal((await db.from("contacts").select("id").eq("company_id", o.companyId)).data?.length ?? 0, 0, "los correos automáticos no crean contactos");
    assert.equal(await saldo(o.companyId), antes, "no se ha gastado ni un crédito");
  });

  it("varios mensajes seguidos de la misma persona se agrupan en una sola tarea", async () => {
    const o = await oficina();
    const e = entrada(o.companyId, o.sara.slug);
    const a = await procesarCorreoRecibido(e, correo({ de: "Laura <laura@clinica.example>", asunto: "Hola", texto: "Quiero información" }));
    const b = await procesarCorreoRecibido(e, correo({ de: "Laura <laura@clinica.example>", asunto: "Hola", texto: "Perdón, se me olvidó: para dos personas" }));
    assert.equal(a.estado, "guardado");
    assert.equal(b.estado, "agrupado");
    assert.equal((await tareas(o.companyId)).length, 1);
    const m = motor([fin("Respondido a los dos mensajes.")]);
    await procesarTareasPendientes(m.deps, { companyId: o.companyId, log: silencio });
    assert.match(String(m.llm.requests[0].messages[0].content), /para dos personas/, "el agente recibe también el segundo mensaje");
  });

  it("una tarea sin origen, un traspaso sin padre, un autoencargo o un origen cambiado: la base lo rechaza", async () => {
    const o = await oficina();
    const base = { company_id: o.companyId, agent_id: o.sara.id, title: "x", model: "claude-haiku-5-5" };
    assert.match((await db.from("tasks").insert(base)).error?.message ?? "", /TAREA_SIN_ORIGEN/);
    assert.match((await db.from("tasks").insert({ ...base, origen: "traspaso" })).error?.message ?? "", /ORIGEN_INVALIDO/);
    assert.match((await db.from("tasks").insert({ ...base, origen: "orden_usuario" })).error?.message ?? "", /ORIGEN_INVALIDO/);
    const { data: raiz } = await db.from("tasks").insert({ ...base, origen: "orden_usuario", ordenado_por: o.duena }).select("id").single();
    assert.match((await db.from("tasks").insert({ ...base, origen: "traspaso", tarea_padre_id: raiz!.id })).error?.message ?? "", /AUTOENCARGO/);
    assert.match((await db.from("tasks").update({ origen: "evento_externo" }).eq("id", raiz!.id)).error?.message ?? "", /ORIGEN_INMUTABLE/);
    const { error } = await db.rpc("agent_traspaso_crear", {
      p_company_id: o.companyId, p_from_agent: o.sara.id, p_to_agent: o.lucia.id, p_tipo: "lead", p_kind: "lead", p_summary: "x", p_card: [], p_ficha: {}, p_ficha_hash: "h",
      p_contact_id: null, p_origin_task_id: null, p_instruccion: "x", p_max_cadena: 6, p_creditos: 1,
    });
    assert.match(error?.message ?? "", /TRASPASO_SIN_ORIGEN/, "pasar_a_agente siempre nace de una tarea con origen");
  });

  it("un agente que intenta programarse trabajo no lo consigue; su seguimiento solo se programa si una persona lo aprueba", async () => {
    const o = await oficina();
    const store = new SupabaseAgentStore(db);
    const taskId = await store.createTask(o.companyId, { agentId: o.sara.id, title: "Lead", model: o.sara.model, origen: { tipo: "orden_usuario", ordenadoPor: o.duena } });
    const m = motor([
      llamada("t1", "programar_tarea", { cuando: "en 3 días", que: "escribir a Laura" }),
      llamada("t2", "proponer_seguimiento", { en_dias: 3, motivo: "Laura no ha contestado", mensaje_previsto: "Hola Laura, ¿pudiste ver la propuesta?" }),
      fin("He propuesto un seguimiento."),
    ]);
    assert.equal((await ejecutarTarea(m.deps, o.companyId, taskId, "Escribe a Laura y, si no contesta, vuelve a intentarlo.")).estado, "done");
    const pasos = (await store.listSteps(o.companyId, taskId)).filter((p) => p.kind === "herramienta");
    assert.match(pasos[0].content, /No está permitido/);
    assert.equal((await tareas(o.companyId)).length, 1, "ninguna tarea nueva");
    const { data: seg } = await db.from("agent_followups").select("*").eq("company_id", o.companyId).single();
    assert.equal(seg!.estado, "propuesto");
    const { data: ap } = await db.from("approvals").select("status, payload").eq("id", seg!.approval_id).single();
    assert.equal(ap!.status, "pending");
    // Sin aprobar, la base no deja crear la tarea del seguimiento.
    assert.match((await db.from("tasks").insert({ company_id: o.companyId, agent_id: o.sara.id, title: "x", model: o.sara.model, origen: "seguimiento_aprobado", seguimiento_id: seg!.id })).error?.message ?? "", /ORIGEN_INVALIDO/);
    // Un miembro no puede aprobarlo; la propietaria sí.
    assert.equal((await db.rpc("seguimiento_resolver", { p_company_id: o.companyId, p_seguimiento_id: seg!.id, p_user_id: o.miembro, p_aprobar: true })).error?.code, "42501");
    const { data: res } = await db.rpc("seguimiento_resolver", { p_company_id: o.companyId, p_seguimiento_id: seg!.id, p_user_id: o.duena, p_aprobar: true });
    const programada = (await tareas(o.companyId)).find((t) => t.id === (res as { task_id: string }).task_id)!;
    assert.equal(programada.origen, "seguimiento_aprobado");
    assert.equal(programada.status, "scheduled");
    assert.equal(programada.tarea_padre_id, taskId);
    assert.equal(programada.tarea_raiz_id, taskId);
    assert.ok(new Date(String(programada.aplazada_hasta)).getTime() > Date.now() + 2 * 86_400_000, "programada para dentro de 3 días");
  });

  it("rutinas: nacen desactivadas, solo las activa una persona, una desactivada no se ejecuta y una activada respeta su límite mensual", async () => {
    const o = await oficina();
    const pasado = new Date(Date.now() - 60_000).toISOString();
    // Ni siquiera con la clave de servicio se crea activa, ni sin persona.
    assert.match((await db.from("agent_routines").insert({ company_id: o.companyId, agent_id: o.sara.id, nombre: "x", instruccion: "x", tipo_tarea: "simple", frecuencia: "diaria", proxima_ejecucion_en: pasado })).error?.message ?? "", /RUTINA_SIN_PERSONA/);
    const { data: r } = await db.from("agent_routines").insert({
      company_id: o.companyId, agent_id: o.sara.id, nombre: "Informe de los lunes", instruccion: "Prepara el informe interno.", tipo_tarea: "simple", frecuencia: "diaria",
      proxima_ejecucion_en: pasado, activa: true, creado_por: o.duena, max_ejecuciones_mes: 2,
    }).select("*").single();
    assert.equal(r!.activa, false, "se crea desactivada aunque se pida activa");
    assert.match((await db.from("agent_routines").update({ activa: true }).eq("id", r!.id)).error?.message ?? "", /RUTINA_SIN_PERSONA/);

    const lanzadas: string[] = [];
    const store = new SupabaseAgentStore(db);
    const m = motor([fin("Informe 1."), fin("Informe 2."), fin("Informe 3.")]);
    const lanzar = async (x: { id: string; companyId: string; agentId: string; nombre: string; instruccion: string }) => {
      const id = await store.createTask(x.companyId, { agentId: x.agentId, title: `Rutina: ${x.nombre}`, model: "claude-haiku-5-5", origen: { tipo: "rutina_usuario", rutinaId: x.id } });
      await ejecutarTarea(m.deps, x.companyId, id, x.instruccion);
      lanzadas.push(id);
    };
    const pasada = (ahora: Date) => ejecutarRutinasVencidas({ db, ahora, lanzar, log: silencio, empresaId: o.companyId });
    const dia = (n: number) => new Date(Date.UTC(2031, 2, n, 9));                     // marzo de 2031

    assert.equal((await pasada(dia(1))).lanzadas, 0, "desactivada: no se ejecuta");
    assert.ifError((await db.from("agent_routines").update({ activa: true, activada_por: o.duena, proxima_ejecucion_en: dia(1).toISOString() }).eq("id", r!.id)).error);
    const { data: activa } = await db.from("agent_routines").select("activada_por, activada_en").eq("id", r!.id).single();
    assert.equal(activa!.activada_por, o.duena, "queda quién la activó");
    assert.ok(activa!.activada_en);
    assert.equal((await pasada(dia(1))).lanzadas, 1);
    assert.equal((await pasada(dia(2))).lanzadas, 1);
    const tercera = await pasada(dia(3));
    assert.equal(tercera.lanzadas, 0);
    assert.equal(tercera.omitidasPorLimite, 1, "límite de 2 al mes");
    assert.equal((await pasada(new Date(Date.UTC(2031, 3, 1, 9)))).lanzadas, 1, "el mes siguiente vuelve a empezar");
    const ts = await tareas(o.companyId);
    assert.equal(ts.length, 3);
    assert.ok(ts.every((t) => t.origen === "rutina_usuario" && t.rutina_id === r!.id && t.status === "done"));
  });

  it("con AGENTES_ACTIVOS=false, con la parada de emergencia o con la oficina pausada no se ejecuta nada (y queda registrado)", async () => {
    const o = await oficina();
    const store = new SupabaseAgentStore(db);
    const lead = async () => (await recibirEvento({ eventos: new SupabaseAlmacenEventos(db), store }, {
      companyId: o.companyId, canal: "meta_lead", clave: `meta-${randomUUID()}`, remitente: `${randomUUID()}@x.example`, agentId: o.sara.id, model: o.sara.model, titulo: "Lead", contenido: "Hola",
    })).taskId!;
    const t = await lead();

    const apagados = motor([fin("no")], { env: { AGENTES_ACTIVOS: "false" } });
    assert.equal((await ejecutarTarea(apagados.deps, o.companyId, t)).estado, "bloqueada");
    assert.equal((await procesarTareasPendientes(apagados.deps, { companyId: o.companyId, log: silencio })).ejecutadas, 0);
    assert.equal(apagados.llm.requests.length, 0);

    const m = motor([fin("no")]);
    await db.from("plataforma_control").update({ parada_emergencia: true, motivo: "Prueba" }).eq("id", true);
    try {
      assert.equal((await ejecutarTarea(m.deps, o.companyId, t)).estado, "bloqueada");
      assert.equal((await procesarTareasPendientes(m.deps, { companyId: o.companyId, log: silencio })).ejecutadas, 0);
    } finally {
      await db.from("plataforma_control").update({ parada_emergencia: false, motivo: null }).eq("id", true);
    }

    // Pausar desde la API (propietaria): nada empieza; al reanudar descartando, lo que esperaba no se atiende.
    const deps = { db, autenticar: async () => sesionDePrueba(o.companyId, o.duena, "owner") };
    const pausar = (cuerpo: unknown) => pausaPostHandler(new Request("http://x/api/oficina/pausa", { method: "POST", body: JSON.stringify(cuerpo) }), deps);
    assert.equal((await pausar({ pausar: true })).status, 200);
    assert.equal((await ejecutarTarea(m.deps, o.companyId, t)).estado, "bloqueada");
    assert.equal((await procesarTareasPendientes(m.deps, { companyId: o.companyId, log: silencio })).ejecutadas, 0);
    assert.equal(m.llm.requests.length, 0, "ninguna llamada al modelo");
    const bloqueos = ((await db.from("tareas_bloqueadas").select("codigo").eq("task_id", t)).data ?? []).map((b) => b.codigo).sort();
    assert.deepEqual(bloqueos, ["agentes_desactivados", "oficina_pausada", "parada_emergencia"]);
    const r = await pausar({ pausar: false, pendientes: "descartar" });
    assert.equal(((await r.json()) as { descartadas: number }).descartadas, 1);
    assert.equal((await tareas(o.companyId))[0].status, "review");
    assert.equal((await procesarTareasPendientes(m.deps, { companyId: o.companyId, log: silencio })).ejecutadas, 0);
    // Un miembro no puede pausar.
    const miembro = { db, autenticar: async () => sesionDePrueba(o.companyId, o.miembro, "member") };
    assert.equal((await pausaPostHandler(new Request("http://x", { method: "POST", body: JSON.stringify({ pausar: true }) }), miembro)).status, 403);
  });
});
