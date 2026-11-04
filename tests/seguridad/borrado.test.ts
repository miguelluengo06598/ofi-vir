/** 4. Borrar un contacto: no debe quedar ningún nodo ni correo suyo (ni rastro en ninguna tabla). */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { SupabaseAgentStore } from "../../src/lib/agents/supabaseStore.ts";
import { crearTarea, ejecutarTarea, type EngineDeps } from "../../src/lib/agents/loop.ts";
import { fin, llamada, recuerdosJson, ScriptedLlm } from "../../src/lib/agents/scriptedLlm.ts";
import { FakeEmbedder } from "../../src/lib/memory/fakeEmbedder.ts";
import { createMemoryService } from "../../src/lib/memory/service.ts";
import { SupabaseMemoryStore } from "../../src/lib/memory/supabaseStore.ts";
import { emailConfigFromEnv } from "../../src/lib/email/config.ts";
import { procesarCorreoRecibido } from "../../src/lib/email/inbound.ts";
import { anotarCorreoRecibido } from "../../src/lib/email/memoryOnReceive.ts";
import type { ReceivedEmail } from "../../src/lib/email/receiver.ts";
import type { EmailSender, OutgoingEmail } from "../../src/lib/email/sender.ts";
import { aprobarYEnviar } from "../../src/lib/email/service.ts";
import { SupabaseEmailStore } from "../../src/lib/email/supabaseStore.ts";
import { admin, COMPANY_A, createUser, psql, RUN } from "./entorno.ts";
import { borrarAgente, crearAgente } from "./datos.ts";

const NOMBRE = `Zacarias Quillfeather${RUN}`;
const APELLIDO = `Quillfeather${RUN}`;
const EMAIL = `delivered+zq${RUN}@resend.dev`;
const LOCAL = `zq${RUN}`;
const enviados: OutgoingEmail[] = [];
const sender: EmailSender = { async send(e) { enviados.push(e); return { id: `re_borrado_${enviados.length}` }; } };

const agentes = SupabaseAgentStore.fromEnv()!;
const correo = SupabaseEmailStore.fromEnv()!;
const memStore = SupabaseMemoryStore.fromEnv()!;
const memory = createMemoryService({ store: memStore, embedder: new FakeEmbedder() });
const deps = (llm: ScriptedLlm): EngineDeps => ({ store: agentes, memory, contacts: memStore, llm });

let agente: { id: string; slug: string };
let user: { id: string };
let contactId: string;
let otros: { nodos: number; correos: number; tareas: number };

/** Dónde aparece un texto en la base: «tabla.columna=n» por cada columna de cada tabla de `public` que lo contenga. */
function barrer(needle: string): string[] {
  const sql = `select x.col from (
    select c.table_name || '.' || c.column_name as col,
           (xpath('/row/n/text()', query_to_xml(format('select count(*) as n from public.%I where %I::text ilike %L', c.table_name, c.column_name, '%${needle.replaceAll("'", "''")}%'), false, true, '')))[1]::text::int as n
      from information_schema.columns c
      join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name and t.table_type = 'BASE TABLE'
     where c.table_schema = 'public' and c.column_name <> 'embedding'
  ) x where x.n > 0 order by 1`;
  const out = psql(sql);
  return out ? out.split("\n") : [];
}

const contarOtros = async () => ({
  nodos: (await admin.from("memory_nodes").select("id", { count: "exact", head: true }).neq("contact_id", contactId)).count ?? 0,
  correos: (await admin.from("emails").select("id", { count: "exact", head: true })).count ?? 0,
  tareas: (await admin.from("tasks").select("id", { count: "exact", head: true })).count ?? 0,
});

before(async () => {
  assert.ok(emailConfigFromEnv().from && emailConfigFromEnv().replyTo);
  agente = await crearAgente("borrado", 50);
  user = await createUser(COMPANY_A, "owner", "borrado");

  // 1) Un lead entra por la instrucción de la tarea; el agente lo guarda, redacta un correo y hace un traspaso.
  const t1 = await crearTarea(deps(new ScriptedLlm([])), COMPANY_A, { agentSlug: agente.slug, title: `Lead de ${NOMBRE}` });
  const llm1 = new ScriptedLlm([
    llamada("a1", "guardar_recuerdo", {
      contacto: { nombre: NOMBRE, email: EMAIL, organizacion: "Plumas SL" },
      nodos: [{ clave: "d", tipo: "dato", titulo: `${NOMBRE} es gerente de Plumas SL`, contenido: `Su correo es ${EMAIL}` }],
    }),
    llamada("a2", "redactar_correo", { correo_del_contacto: EMAIL, asunto: `Hola ${NOMBRE}`, cuerpo: `Hola, ${NOMBRE}: gracias por escribirnos.` }),
    llamada("a3", "pasar_a_departamento", { departamento: "Atención al cliente", tipo: "aviso", resumen: `${NOMBRE} pregunta por el plazo`, ficha: [{ etiqueta: "Contacto", valor: EMAIL }] }),
    fin(`He guardado a ${NOMBRE} y dejado un borrador.`),
    recuerdosJson([{ tipo: "objecion", sobre: "contacto", titulo: `A ${NOMBRE} le preocupa el plazo`, contenido: "Quiere empezar este mes.", confianza: 0.8 }]),
  ]);
  await ejecutarTarea(deps(llm1), COMPANY_A, t1, `Lead ficticio: ${NOMBRE} <${EMAIL}>, gerente de Plumas SL.`);

  // 2) Se aprueba y se envía (con un remitente falso), y el contacto responde.
  const config = { ...emailConfigFromEnv(), apiKey: "clave-falsa" };
  const borrador = (await agentes.listPendingDrafts(COMPANY_A)).find((d) => d.toEmail === EMAIL)!;
  const env = await aprobarYEnviar({ store: correo, sender, config }, COMPANY_A, user.id, { agentSlug: agente.slug, toEmail: EMAIL, subject: borrador.subject, body: borrador.body });
  assert.equal(env.estado, "enviado");
  const respuesta: ReceivedEmail = {
    id: `re_in_${RUN}`, from: `${NOMBRE} <${EMAIL}>`, to: ["resp@x.example"], subject: `Re: ${borrador.subject}`,
    text: `Hola, soy ${NOMBRE}. Podemos hablar el jueves.`, html: null,
    headers: { "in-reply-to": enviados[0].headers["Message-ID"], references: enviados[0].headers["Message-ID"] }, messageId: `<r-${RUN}@resend.dev>`,
    createdAt: new Date().toISOString(), attachments: [],
  };
  const entrante = await procesarCorreoRecibido(
    { store: correo, fetcher: { get: async () => respuesta }, defaultCompanyId: COMPANY_A, defaultAgentSlug: agente.slug, alGuardar: anotarCorreoRecibido },
    { type: "email.received", data: { email_id: respuesta.id, from: respuesta.from, to: respuesta.to, subject: respuesta.subject, message_id: respuesta.messageId!, created_at: respuesta.createdAt } },
  );
  assert.ok(entrante.estado === "guardado");

  // 3) El agente lee la respuesta. Esta vez NO indica el contacto al guardar (un descuido normal de un modelo) y hace otro traspaso.
  const llm2 = new ScriptedLlm([
    llamada("b1", "guardar_recuerdo", { nodos: [{ clave: "p", tipo: "dato", titulo: `${NOMBRE} acepta hablar el jueves`, contenido: "Disponible por la tarde." }] }),
    llamada("b2", "pasar_a_departamento", { departamento: "Dirección", tipo: "informe", resumen: `${NOMBRE} acepta una llamada`, ficha: [] }),
    fin("Anotado."),
    recuerdosJson([{ tipo: "acuerdo", sobre: "contacto", titulo: `Llamada con ${NOMBRE} el jueves`, contenido: "", confianza: 0.9 }]),
  ]);
  await ejecutarTarea(deps(llm2), COMPANY_A, (entrante as { taskId: string }).taskId);

  contactId = (await memStore.findContactByEmail(COMPANY_A, EMAIL))!.id;
  otros = await contarOtros();
});

after(async () => {
  await borrarAgente(agente.id);
  await admin.from("contacts").delete().eq("email", EMAIL);
  await admin.from("handoffs").delete().like("summary", `%${NOMBRE}%`);
  await admin.from("users").delete().eq("id", user.id);
  await admin.auth.admin.deleteUser(user.id);
});

describe("borrar un contacto (RGPD)", () => {
  it("antes de borrar, su rastro está en muchas tablas (control: el barrido encuentra cosas)", () => {
    const sitios = barrer(APELLIDO).map((s) => s.split("=")[0].split(".")[0]);
    for (const t of ["memory_nodes", "tasks", "task_steps", "approvals", "emails", "contacts", "handoffs"]) assert.ok(sitios.includes(t), `esperaba rastro en ${t}`);
  });

  it("después de borrar no queda ningún nodo, correo, aprobación, tarea, paso ni traspaso suyo, en ninguna columna de ninguna tabla", async () => {
    const antes = await contarOtros();
    const r = await memory.borrarContacto(COMPANY_A, contactId, `sec-test:${user.id}`);
    assert.equal(r.borrado, true);
    assert.ok(r.recuentos.nodos >= 4 && r.recuentos.correos >= 2 && r.recuentos.tareas >= 2, JSON.stringify(r.recuentos));

    assert.equal((await admin.from("contacts").select("id").eq("id", contactId).maybeSingle()).data, null);
    assert.equal((await admin.from("memory_nodes").select("id").eq("contact_id", contactId)).data?.length, 0);
    assert.equal((await admin.from("email_threads").select("id").eq("contact_id", contactId)).data?.length, 0);
    assert.equal((await admin.from("tasks").select("id").eq("contact_id", contactId)).data?.length, 0);

    const restos = [...barrer(APELLIDO), ...barrer(EMAIL), ...barrer(LOCAL)];
    assert.deepEqual([...new Set(restos)], [], "quedan rastros del contacto en estas columnas");

    // Y no se llevó nada de otros clientes.
    const despues = await contarOtros();
    assert.equal(despues.nodos, otros.nodos, "los nodos de otros contactos siguen intactos");
    assert.ok(despues.correos < antes.correos && despues.tareas < antes.tareas);
  });

  it("la constancia del borrado no guarda datos personales", () => {
    const fila = psql(`select row_to_json(e)::text from public.erasure_log e where e.contact_id = '${contactId}'`);
    assert.ok(fila, "hay constancia del borrado");
    for (const dato of [APELLIDO, EMAIL, LOCAL]) assert.equal(fila.includes(dato), false, `la constancia contiene ${dato}`);
  });

  it("se puede buscar en la memoria después: no devuelve nada suyo", async () => {
    const r = await memory.buscarEnMemoria(COMPANY_A, `${NOMBRE} jueves plazo llamada`);
    assert.equal(JSON.stringify(r).includes(APELLIDO), false);
  });
});
