/** 2. Una persona de la empresa A intenta leer o tocar memoria, correos, tareas… de la empresa B: debe fallar. */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SupabaseAgentStore } from "../../src/lib/agents/supabaseStore.ts";
import { crearTarea, ejecutarTarea } from "../../src/lib/agents/loop.ts";
import { ScriptedLlm } from "../../src/lib/agents/scriptedLlm.ts";
import { FakeEmbedder } from "../../src/lib/memory/fakeEmbedder.ts";
import { createMemoryService } from "../../src/lib/memory/service.ts";
import { SupabaseMemoryStore } from "../../src/lib/memory/supabaseStore.ts";
import { SupabaseEmailStore } from "../../src/lib/email/supabaseStore.ts";
import { admin, anonymous, COMPANY_A, COMPANY_B, createUser, must } from "./entorno.ts";
import { borrarEmpresaB, crearEmpresaB } from "./datos.ts";
import { ORDEN_DE_PRUEBA } from "../../src/lib/agents/pruebas.ts";

type B = Awaited<ReturnType<typeof crearEmpresaB>>;
let b: B;
let miembroA: { id: string; client: SupabaseClient };
let propietarioA: { id: string; client: SupabaseClient };

before(async () => {
  b = await crearEmpresaB();
  miembroA = await createUser(COMPANY_A, "member", "miembro-a");
  propietarioA = await createUser(COMPANY_A, "owner", "propietario-a");
});
after(async () => {
  await admin.auth.admin.deleteUser(miembroA.id);
  await admin.auth.admin.deleteUser(propietarioA.id);
  await admin.from("users").delete().in("id", [miembroA.id, propietarioA.id]);
  await borrarEmpresaB();
});

const TABLAS_DE_B = () =>
  [
    ["companies", "id", COMPANY_B],
    ["departments", "company_id", COMPANY_B],
    ["agents", "company_id", COMPANY_B],
    ["contacts", "company_id", COMPANY_B],
    ["email_threads", "company_id", COMPANY_B],
    ["emails", "company_id", COMPANY_B],
    ["memory_nodes", "company_id", COMPANY_B],
    ["tasks", "company_id", COMPANY_B],
    ["task_steps", "company_id", COMPANY_B],
    ["approvals", "company_id", COMPANY_B],
  ] as const;

describe("lectura entre empresas (con sesión real de la empresa A)", () => {
  it("no ve ninguna fila de B en ninguna tabla, ni filtrando por la empresa ni por id", async () => {
    for (const [tabla, col, valor] of TABLAS_DE_B()) {
      for (const [who, c] of [["miembro", miembroA.client], ["propietario", propietarioA.client]] as const) {
        const { data, error } = await c.from(tabla).select("*").eq(col, valor);
        assert.equal(error, null, `${tabla}: ${error?.message}`);
        assert.deepEqual(data, [], `${who} de A leyó ${tabla} de B`);
      }
    }
    const ids: [string, string][] = [["contacts", b.contact], ["emails", b.email], ["memory_nodes", b.node], ["tasks", b.task], ["approvals", b.approval], ["email_threads", b.thread]];
    for (const [tabla, id] of ids) assert.deepEqual((await miembroA.client.from(tabla).select("*").eq("id", id)).data, [], `${tabla} por id`);
  });

  it("sí ve lo suyo (control positivo: el test no pasa solo porque todo esté vacío)", async () => {
    const { data } = await miembroA.client.from("agents").select("id").eq("company_id", COMPANY_A);
    assert.ok((data?.length ?? 0) > 0);
  });

  it("la búsqueda por significado de A no devuelve nodos de B, ni usando el vector exacto del nodo de B", async () => {
    const { data, error } = await miembroA.client.rpc("match_memory_nodes", { query_embedding: `[${b.vector.join(",")}]`, match_count: 50 });
    assert.equal(error, null);
    assert.equal((data as { id: string }[]).some((n) => n.id === b.node), false);
  });

  it("sin sesión (anon) no se lee nada", async () => {
    const anon = anonymous();
    for (const t of ["contacts", "emails", "memory_nodes", "tasks", "task_steps", "approvals"]) {
      const { data } = await anon.from(t).select("*").limit(5);
      assert.deepEqual(data ?? [], [], `anon leyó ${t}`);
    }
  });
});

describe("escritura entre empresas", () => {
  it("no puede modificar ni borrar filas de B", async () => {
    const c = propietarioA.client;
    await c.from("contacts").update({ name: "Hackeado" }).eq("id", b.contact);
    await c.from("memory_nodes").update({ title: "Hackeado" }).eq("id", b.node);
    await c.from("approvals").update({ status: "approved" }).eq("id", b.approval);
    await c.from("tasks").update({ title: "Hackeado" }).eq("id", b.task);
    await c.from("contacts").delete().eq("id", b.contact);
    await c.from("memory_nodes").delete().eq("id", b.node);
    await c.from("emails").delete().eq("id", b.email);
    const { data: contacto } = await admin.from("contacts").select("name").eq("id", b.contact).single();
    assert.equal(contacto?.name, "Cliente Secreto de B");
    assert.equal((await admin.from("memory_nodes").select("title").eq("id", b.node).single()).data?.title, "Nodo secreto de B");
    assert.equal((await admin.from("approvals").select("status").eq("id", b.approval).single()).data?.status, "pending");
    assert.equal((await admin.from("tasks").select("title").eq("id", b.task).single()).data?.title, "Tarea secreta de B");
    assert.ok((await admin.from("emails").select("id").eq("id", b.email).maybeSingle()).data, "el correo de B sigue ahí");
  });

  it("no puede insertar datos en B ni mover los suyos a B", async () => {
    const c = propietarioA.client;
    const r1 = await c.from("contacts").insert({ company_id: COMPANY_B, name: "Intruso", email: `intruso-${COMPANY_B}@x.example` });
    assert.ok(r1.error, "insertar un contacto en B debe fallar");
    const mio = await must(admin.from("contacts").insert({ company_id: COMPANY_A, name: "Mío", email: `mio-${Date.now()}@x.example` }).select("id").single(), "contacto A");
    const r2 = await c.from("contacts").update({ company_id: COMPANY_B }).eq("id", mio.id);
    const { data: despues } = await admin.from("contacts").select("company_id").eq("id", mio.id).single();
    assert.equal(despues?.company_id, COMPANY_A, `mover un contacto a B debe fallar (${r2.error?.message ?? "0 filas"})`);
    await admin.from("contacts").delete().eq("id", mio.id);
  });

  it("nadie se cambia de empresa ni de rol a sí mismo, ni se mete en otra empresa", async () => {
    const c = miembroA.client;
    // Las pertenencias solo las escribe el servidor (funciones SQL con comprobación de rol): desde el navegador, nada.
    await c.from("company_members").update({ rol: "propietario" }).eq("user_id", miembroA.id);
    await c.from("company_members").update({ company_id: COMPANY_B }).eq("user_id", miembroA.id);
    const r = await c.from("company_members").insert({ company_id: COMPANY_B, user_id: miembroA.id, rol: "propietario" });
    assert.ok(r.error, "no puede darse de alta en otra empresa");
    const { data } = await admin.from("company_members").select("company_id, rol").eq("user_id", miembroA.id);
    assert.deepEqual(data, [{ company_id: COMPANY_A, rol: "miembro" }]);
  });

  it("las funciones internas (borrar contactos, crear borradores, aprobar, buscar) no se pueden llamar desde el navegador", async () => {
    const c = propietarioA.client;
    const llamadas: [string, Record<string, unknown>][] = [
      ["erase_contact", { p_company_id: COMPANY_B, p_contact_id: b.contact, p_requested_by: "intruso" }],
      ["erase_contact", { p_company_id: COMPANY_A, p_contact_id: b.contact, p_requested_by: "intruso" }],
      ["approve_email_draft", { p_company_id: COMPANY_B, p_approval_id: b.approval, p_user_id: propietarioA.id, p_subject: "x", p_body: "y" }],
      ["agent_create_email_draft", { p_company_id: COMPANY_B, p_agent_id: b.agent, p_contact_id: b.contact, p_subject: "x", p_body: "y" }],
      ["agent_create_handoff", { p_company_id: COMPANY_B, p_from_agent: b.agent, p_to_department: b.dep, p_kind: "aviso", p_summary: "x", p_card: [] }],
      ["agent_emails_sent_today", { p_company_id: COMPANY_B, p_agent_id: b.agent }],
      ["search_memory_nodes", { p_company_id: COMPANY_B, query_embedding: `[${b.vector.join(",")}]`, match_count: 5 }],
    ];
    for (const [fn, args] of llamadas) {
      const { error } = await c.rpc(fn, args);
      assert.ok(error, `${fn} se ejecutó desde el navegador`);
    }
    assert.ok((await admin.from("contacts").select("id").eq("id", b.contact).maybeSingle()).data, "el contacto de B sigue existiendo");
  });
});

describe("capa de servidor: el motor y los almacenes (clave de servicio) filtran por empresa", () => {
  it("con el id de empresa A no se alcanza nada de B", async () => {
    const agentes = SupabaseAgentStore.fromEnv()!;
    const mem = SupabaseMemoryStore.fromEnv()!;
    const correo = SupabaseEmailStore.fromEnv()!;
    assert.equal(await agentes.getTask(COMPANY_A, b.task), null);
    assert.deepEqual(await agentes.listSteps(COMPANY_A, b.task), []);
    assert.deepEqual(await agentes.listLearned(COMPANY_A, b.task), []);
    assert.equal(await agentes.getAgent(COMPANY_A, b.agent), null);
    assert.equal(await mem.getContact(COMPANY_A, b.contact), null);
    assert.equal(await mem.findContactByEmail(COMPANY_A, `secreto-${b.contact}@empresab.example`), null);
    assert.equal(await correo.getEmail(COMPANY_A, b.email), null);
    assert.equal((await mem.listNodes(COMPANY_A)).some((n) => n.id === b.node), false);
    const memoria = createMemoryService({ store: mem, embedder: new FakeEmbedder() });
    const r = await memoria.buscarEnMemoria(COMPANY_A, "nodo secreto de la empresa b confidencial");
    assert.equal(r.resultados.some((x) => x.id === b.node), false);
    await assert.rejects(() => memoria.historialDelContacto(COMPANY_A, b.contact), /no encontrado/i);
    assert.equal(await agentes.claimTask(COMPANY_A, b.task, "intruso").catch(() => false), false, "no se puede reservar una tarea de B");
    await assert.rejects(() => agentes.createDraft(COMPANY_A, { agentId: b.agent, contactId: b.contact, subject: "x", body: "y" }));
    await assert.rejects(() => agentes.createHandoff(COMPANY_A, { fromAgentId: b.agent, toDepartmentId: b.dep, kind: "aviso", summary: "x", card: [] }));
    const deps = { store: agentes, memory: memoria, contacts: mem, llm: new ScriptedLlm([]) };
    await assert.rejects(() => ejecutarTarea(deps, COMPANY_A, b.task, "hola"), /no encontrada/i);
    await assert.rejects(() => crearTarea(deps, COMPANY_A, { agentSlug: `b-agente-${b.agent}`, title: "x", origen: ORDEN_DE_PRUEBA }), /no encontrado/i);
    assert.equal((await admin.from("task_steps").select("id").eq("task_id", b.task)).data?.length, 1, "los pasos de B no cambiaron");
  });
});
