import { certificarAgenteDePrueba } from "../../src/lib/certificacion/datosDePrueba.ts";
import { FakeEmbedder } from "../../src/lib/memory/fakeEmbedder.ts";
import { admin, COMPANY_A, COMPANY_B, RUN, must } from "./entorno.ts";

const VENTAS = "36be8074-504e-4ef4-aa98-135ad3e9acb0";
const ATENCION = "3bd58844-d48e-4d17-aa9b-d45d078a606a";
const TOOLS = ["buscar_en_memoria", "ver_historial_del_contacto", "guardar_recuerdo", "redactar_correo", "pasar_a_departamento"];

/** Agente de prueba de la empresa A (límite diario configurable). */
export async function crearAgente(slug: string, limite: number, dept = VENTAS) {
  const agente = await must(
    admin.from("agents").insert({
      company_id: COMPANY_A, department_id: dept, slug: `${slug}-${RUN}`, name: `Agente ${slug}`, role: "Pruebas", creator_name: "Pruebas",
      model: "claude-haiku-5-5", daily_email_limit: limite, allowed_tools: TOOLS, instructions: `Eres ${slug}.`, status: "working",
    }).select("id, slug, name").single(),
    "crear agente",
  );
  // El motor real solo ejecuta agentes activos y certificados: estos reciben una certificación de PRUEBA (solo base local).
  await certificarAgenteDePrueba(admin, COMPANY_A, agente.id as string);
  return agente;
}
export const DEPT_VENTAS = VENTAS;
export const DEPT_ATENCION = ATENCION;

/** Datos mínimos de la empresa B, con todo lo que una empresa tiene: lo que A no debe poder ver. */
export async function crearEmpresaB() {
  await must(admin.from("companies").insert({ id: COMPANY_B, name: `Taller Delta ${RUN}` }).select("id").single(), "empresa B");
  const dep = await must(admin.from("departments").insert({ company_id: COMPANY_B, name: "Taller", slug: "taller" }).select("id").single(), "departamento B");
  const agent = await must(
    admin.from("agents").insert({ company_id: COMPANY_B, department_id: dep.id, slug: `b-agente-${RUN}`, name: "Agente B", role: "Taller", creator_name: "Pruebas", model: "claude-haiku-5-5", allowed_tools: TOOLS, instructions: "Secreto de B" }).select("id").single(),
    "agente B",
  );
  const contact = await must(admin.from("contacts").insert({ company_id: COMPANY_B, name: "Cliente Secreto de B", email: `secreto-${RUN}@empresab.example` }).select("id").single(), "contacto B");
  const thread = await must(admin.from("email_threads").insert({ company_id: COMPANY_B, contact_id: contact.id, agent_id: agent.id, subject: "Asunto confidencial de B" }).select("id").single(), "hilo B");
  const email = await must(
    admin.from("emails").insert({ company_id: COMPANY_B, thread_id: thread.id, direction: "inbound", from_address: `secreto-${RUN}@empresab.example`, to_address: "b@x.example", subject: "Confidencial B", body: "Cuerpo confidencial de B", delivery_status: "received" }).select("id").single(),
    "correo B",
  );
  const [vec] = await new FakeEmbedder().embed(["nodo secreto de la empresa b"], "document");
  const node = await must(
    admin.from("memory_nodes").insert({ company_id: COMPANY_B, contact_id: contact.id, node_type: "dato", title: "Nodo secreto de B", content: "Dato confidencial de B", embedding: `[${vec.join(",")}]`, created_by_agent_id: agent.id }).select("id").single(),
    "nodo B",
  );
  // Toda tarea tiene origen: un mensaje que llegó de fuera.
  const evento = await must(admin.from("eventos_externos").insert({ company_id: COMPANY_B, canal: "whatsapp", estado: "aceptado" }).select("id").single(), "evento B");
  const task = await must(admin.from("tasks").insert({ company_id: COMPANY_B, agent_id: agent.id, title: "Tarea secreta de B", model: "claude-haiku-5-5", contact_id: contact.id, origen: "evento_externo", evento_id: evento.id }).select("id").single(), "tarea B");
  await must(admin.from("task_steps").insert({ company_id: COMPANY_B, task_id: task.id, position: 0, step: 0, kind: "instruccion", content: "Paso confidencial de B" }).select("id").single(), "paso B");
  const approval = await must(
    admin.from("approvals").insert({ company_id: COMPANY_B, agent_id: agent.id, kind: "other", title: "Aprobación de B", payload: {} }).select("id").single(),
    "aprobación B",
  );
  return { dep: dep.id as string, agent: agent.id as string, contact: contact.id as string, thread: thread.id as string, email: email.id as string, node: node.id as string, task: task.id as string, approval: approval.id as string, vector: vec };
}

export async function borrarEmpresaB() {
  await admin.from("companies").delete().eq("id", COMPANY_B); // cascada: todo lo de B
}

/** Borra lo que una prueba creó para el agente de la empresa A (las FK sin cascada exigen este orden). */
export async function borrarAgente(agentId: string) {
  await admin.from("emails").delete().in("thread_id", ((await admin.from("email_threads").select("id").eq("agent_id", agentId)).data ?? []).map((t) => t.id));
  await admin.from("handoffs").delete().eq("from_agent_id", agentId);
  await admin.from("handoffs").delete().eq("to_agent_id", agentId);
  await admin.from("approvals").delete().eq("agent_id", agentId);
  await admin.from("email_threads").delete().eq("agent_id", agentId);
  await admin.from("tasks").delete().eq("agent_id", agentId);
  await admin.from("memory_nodes").delete().eq("created_by_agent_id", agentId);
  await admin.from("certifications").delete().eq("agent_id", agentId);
  await admin.from("certification_requests").delete().eq("agent_id", agentId);
  await admin.from("agents").delete().eq("id", agentId);
}
