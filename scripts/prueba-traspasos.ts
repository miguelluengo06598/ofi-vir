/**
 * Demostración de traspasos contra la base LOCAL real: Sara recibe «Quiero presupuesto de implantes» → traspasa a Lucía (lead)
 * → Lucía crea el contacto → traspasa a Iván (datos). Al final enseña la ficha de cada traspaso.
 *
 * Real: la base de datos, el motor, el ejecutor de herramientas, los permisos, la validación de fichas, la cadena y el cobro de créditos.
 * De mentira: el MODELO (guion fijo, ScriptedLlm): no se llama a Claude ni se gasta ni un token.
 *
 *   npm run prueba:traspasos
 */
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { crearTarea, ejecutarTarea, type EngineDeps } from "../src/lib/agents/loop.ts";
import { fin, llamada, ScriptedLlm } from "../src/lib/agents/scriptedLlm.ts";
import { SupabaseAgentStore } from "../src/lib/agents/supabaseStore.ts";
import { SupabaseAlmacenHerramientas } from "../src/lib/agentes/herramientas/supabaseAlmacen.ts";
import { GestorSecretos } from "../src/lib/agentes/herramientas/tipos.ts";
import { procesarTraspasos } from "../src/lib/agentes/traspasos/procesar.ts";
import { crearServicioCreditos } from "../src/lib/creditos/servicio.ts";
import { FakeEmbedder } from "../src/lib/memory/fakeEmbedder.ts";
import { createMemoryService } from "../src/lib/memory/service.ts";
import { SupabaseMemoryStore } from "../src/lib/memory/supabaseStore.ts";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim(), key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
if (!url || !key) throw new Error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY (usa --env-file=.env.local).");
if (!/^https?:\/\/(127\.0\.0\.1|localhost)[:/]/.test(url)) throw new Error(`Solo contra la base LOCAL (${url} no lo es).`);
const db = createClient(url, key, { auth: { persistSession: false } });
const creditos = crearServicioCreditos({ db, esLocal: true });
const RUN = randomUUID().slice(0, 6);

const companyId = randomUUID(), departmentId = randomUUID();
await db.from("companies").insert({ id: companyId, name: `Clínica demo traspasos ${RUN}` });
await db.from("departments").insert({ id: departmentId, company_id: companyId, name: "Ventas", slug: `ventas-${RUN}` });
const crear = async (name: string, role: string) => {
  const a = { id: randomUUID(), slug: `${name.toLowerCase()}-${RUN}`, name };
  const { error } = await db.from("agents").insert({ id: a.id, company_id: companyId, department_id: departmentId, slug: a.slug, name, role, creator_name: "IDESIE", model: "claude-haiku-5-5" });
  if (error) throw new Error(error.message);
  await db.from("agent_tools").insert([{ agent_id: a.id, company_id: companyId, tool_id: "pasar_a_agente", permiso: "sola" }, { agent_id: a.id, company_id: companyId, tool_id: "guardar_recuerdo", permiso: "sola" }]);
  return a;
};
const sara = await crear("Sara", "Atención por WhatsApp"), lucia = await crear("Lucía", "Ventas (SDR)"), ivan = await crear("Iván", "CRM");
await db.from("agent_handoffs").insert([
  { company_id: companyId, agent_id_origen: sara.id, agent_id_destino: lucia.id, condicion: "piden presupuesto o quieren contratar", tipo_traspaso: "lead" },
  { company_id: companyId, agent_id_origen: lucia.id, agent_id_destino: ivan.id, condicion: "hay que registrar el contacto en el CRM", tipo_traspaso: "datos" },
]);
await creditos.anadirCreditos(companyId, "prueba", "prueba", null, `demo-traspasos:${companyId}`);
const saldoAntes = (await creditos.obtenerSaldo(companyId)).disponible;

const store = new SupabaseAgentStore(db), memStore = new SupabaseMemoryStore(db);
const memory = createMemoryService({ store: memStore, embedder: new FakeEmbedder() });
const llm = new ScriptedLlm([
  llamada("t1", "pasar_a_agente", { agente_destino: "Lucía", resumen: "Laura Gómez quiere presupuesto de implantes", ficha: { nombre: "Laura Gómez", contacto: "laura@ejemplo.es", interes: "Presupuesto de implantes", origen: "WhatsApp", urgencia: "alta" } }),
  fin("Lo he pasado a Lucía."),
  llamada("t2", "guardar_recuerdo", { contacto: { nombre: "Laura Gómez", email: "laura@ejemplo.es" }, nodos: [{ clave: "a", tipo: "dato", titulo: "Interés en implantes", contenido: "Pide presupuesto de implantes por WhatsApp." }] }),
  llamada("t3", "pasar_a_agente", { agente_destino: "Iván", resumen: "Registrar a Laura Gómez en el CRM", ficha: { nombre: "Laura Gómez", correo: "laura@ejemplo.es", etapa: "Cualificada", notas: "Presupuesto de implantes, urgencia alta" } }),
  fin("Lo he pasado a Iván."),
  fin("Iván: contacto listo para registrar en el CRM."),
]);
const deps: EngineDeps = { store, memory, contacts: memStore, llm, aprender: false, catalogo: { almacen: new SupabaseAlmacenHerramientas(db, creditos), secretos: (c) => new GestorSecretos(c, async () => null) } };

console.log("Sara recibe: «Quiero presupuesto de implantes»\n");
// El WhatsApp de Laura es un evento externo: es el ORIGEN de toda la cadena (Sara → Lucía → Iván).
const { data: evento, error: eEvento } = await db.from("eventos_externos").insert({ company_id: companyId, canal: "whatsapp", estado: "aceptado", agent_id: sara.id }).select("id").single();
if (eEvento || !evento) throw new Error(eEvento?.message ?? "No se pudo registrar el evento.");
const id = await crearTarea(deps, companyId, { agentSlug: sara.slug, title: "WhatsApp de Laura", origen: { tipo: "evento_externo", eventoId: evento.id as string, canal: "whatsapp" } });
await ejecutarTarea(deps, companyId, id, "Quiero presupuesto de implantes");
const r = await procesarTraspasos(deps, { companyId });
console.log(`Tareas de traspaso ejecutadas: ${r.ejecutadas} (errores: ${r.errores})\n`);

const nombre = new Map([sara, lucia, ivan].map((a) => [a.id, a.name]));
const { data: hs } = await db.from("handoffs").select("*").eq("company_id", companyId).order("position");
for (const h of hs ?? []) {
  console.log(`── Traspaso ${h.position}: ${nombre.get(h.from_agent_id)} → ${nombre.get(h.to_agent_id)}  [${h.tipo_traspaso} · formato ${h.kind}] ──`);
  console.log(`   Resumen:  ${h.summary}`);
  console.log(`   Estado:   ${h.status}   Coste: ${h.credits} crédito   Hora: ${h.occurred_at}   Cadena: ${h.chain_id}`);
  console.log("   Ficha:");
  for (const [k, v] of Object.entries(h.ficha as Record<string, unknown>)) console.log(`     ${k.padEnd(10)} ${v}`);
  const { data: t } = await db.from("tasks").select("id, status").eq("handoff_id", h.id).single();
  console.log(`   Tarea del agente destino: ${t?.id} (${t?.status})\n`);
}
const { data: contactos } = await db.from("contacts").select("name, email").eq("company_id", companyId);
console.log("Contactos creados por Lucía:", JSON.stringify(contactos));
console.log(`Créditos gastados en traspasos: ${saldoAntes - (await creditos.obtenerSaldo(companyId)).disponible}`);
