/**
 * Prueba de extremo a extremo del asistente de configuración contra la base local, pasando por los manejadores HTTP reales.
 *   npm run prueba:asistente            modelo GUIONIZADO (no gasta API; los créditos y la base sí son reales)
 *   npm run prueba:asistente -- --real  Claude Sonnet de verdad (necesita una ANTHROPIC_API_KEY válida)
 * Deja aplicada la configuración en el agente de prueba (Sofía Navarro, plantilla sara-whatsapp): `npm run db:reset` la deshace.
 */
import { createClient } from "@supabase/supabase-js";
import { HERRAMIENTA_PROPUESTA } from "../src/lib/agentes/asistente/prompt.ts";
import { asistenteHandler, aplicarHandler, depsAsistenteDesdeEntorno } from "../src/lib/agentes/asistente/api.ts";
import { ScriptedLlm, uso } from "../src/lib/agents/scriptedLlm.ts";

const real = process.argv.includes("--real");
const SOFIA = "426ade0b-f542-472b-aa70-3b385993a459", LUCIA = "0e9902f1-d636-4806-a597-7d1d4bf9e7b4";
const api = depsAsistenteDesdeEntorno()!;
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

const horario = { lun: [["09:00", "20:00"]], mar: [["09:00", "20:00"]], mie: [["09:00", "20:00"]], jue: [["09:00", "20:00"]], vie: [["09:00", "20:00"]] };
const base = {
  negocio_resumen: "Clínica dental en Madrid. El primer diagnóstico es gratuito. Abre de lunes a viernes de 9:00 a 20:00.",
  tono: "Cercano y tranquilizador, sin tecnicismos; tutea.",
  objetivo: "Resolver dudas de pacientes por WhatsApp y conseguir que pidan cita para su primer diagnóstico gratuito.",
  nunca_hace: "Nunca da precios de tratamientos.",
  reglas: { zona_horaria: "Europe/Madrid", horario, fuera_de_horario: "responder_y_avisar", mensaje_fuera_horario: null, idioma: "es" },
  conocimiento_que_falta: ["¿Tenéis una lista de precios (para el equipo, no para dar por WhatsApp)?", "Preguntas frecuentes de pacientes (urgencias, financiación, seguros)", "Dirección y cómo llegar"],
};
const guion = new ScriptedLlm([
  { stopReason: "tool_use", usage: uso(5200, 1300), content: [{ type: "tool_use", id: "t1", name: HERRAMIENTA_PROPUESTA, input: {
    ...base,
    respuesta: "He entendido que sois una clínica dental en Madrid (L–V, 9:00–20:00), que el primer diagnóstico es gratis y que Sara debe pedir cita y no dar precios. Os dejo la propuesta. Antes de aplicarla: ¿atendéis urgencias fuera de ese horario? ¿Queréis que los interesados en implantes pasen al equipo comercial?",
    instrucciones_empresa: "Ofrece siempre el primer diagnóstico gratuito y propón una cita. Si preguntan por el precio de un tratamiento, no des cifras: explica que depende del diagnóstico y ofrece la cita gratuita.",
    permisos: [{ herramienta_id: "crear_cita", permiso: "sola", motivo: "La empresa quiere que Sara pida cita" }, { herramienta_id: "responder_whatsapp", permiso: "sola", motivo: "Responde dudas" }],
    traspasos: [], dudas: ["¿Atendéis urgencias fuera de horario?", "¿Los interesados en implantes pasan a Ventas?"],
  } }] },
  { stopReason: "tool_use", usage: uso(6100, 1400), content: [{ type: "tool_use", id: "t2", name: HERRAMIENTA_PROPUESTA, input: {
    ...base,
    respuesta: "Perfecto. He añadido el traspaso a Lucía (Ventas) para quien pregunte por implantes y he puesto un mensaje para cuando estéis cerrados. Revisad y aplicad si os encaja.",
    reglas: { ...base.reglas, mensaje_fuera_horario: "Ahora estamos cerrados (abrimos de lunes a viernes de 9:00 a 20:00). Si es una urgencia, llámanos al teléfono de la clínica." },
    instrucciones_empresa: "Ofrece siempre el primer diagnóstico gratuito y propón una cita. Si preguntan por el precio de un tratamiento, no des cifras: explica que depende del diagnóstico y ofrece la cita gratuita. Si es una urgencia, indica que llamen a la clínica.",
    permisos: [{ herramienta_id: "crear_cita", permiso: "aprobacion", motivo: "Pide cita; una persona la confirma" }, { herramienta_id: "responder_whatsapp", permiso: "sola", motivo: "Responde dudas" }],
    traspasos: [{ agente_id: LUCIA, condicion: "Preguntan por implantes o quieren un presupuesto", tipo: "lead" }], dudas: [],
  } }] },
]);
if (!real) api.deps.llm = guion;
console.log(real ? "Modelo: Claude Sonnet REAL\n" : "Modelo: GUIONIZADO (la propuesta la he escrito yo; no es salida de Claude)\n");

const post = async (ruta: string, cuerpo: unknown, h: typeof asistenteHandler) =>
  h(new Request(`http://localhost${ruta}`, { method: "POST", body: JSON.stringify(cuerpo) }), SOFIA, api);
const verJson = async (r: Response) => ({ status: r.status, cuerpo: await r.json() });

const saldo0 = (await db.from("company_credit_balance").select("saldo_disponible").eq("company_id", "a64499d1-7f43-4a43-abc8-41a313dc4018").single()).data!.saldo_disponible;

const t1 = await verJson(await post(`/api/agentes/${SOFIA}/asistente`, { mensaje: "Somos una clínica dental en Madrid, abrimos de 9 a 20 de lunes a viernes, el primer diagnóstico es gratis, queremos que Sara pida cita y que nunca dé precios de tratamientos" }, asistenteHandler));
console.log("── TURNO 1 → HTTP", t1.status);
console.log(JSON.stringify(t1.cuerpo, null, 2));
if (t1.status !== 200) process.exit(1);

const t2 = await verJson(await post(`/api/agentes/${SOFIA}/asistente`, { sesionId: t1.cuerpo.sesionId, mensaje: "Sí, urgencias solo llamando a la clínica. Y los que pregunten por implantes pasadlos a Lucía, de Ventas." }, asistenteHandler));
console.log("\n── TURNO 2 → HTTP", t2.status);
console.log(JSON.stringify({ ...t2.cuerpo, propuesta: undefined }, null, 2));
console.log("Propuesta actualizada (cambios):", JSON.stringify({ respuesta: t2.cuerpo.propuesta?.respuesta, traspasos: t2.cuerpo.propuesta?.traspasos, mensaje_fuera_horario: t2.cuerpo.propuesta?.reglas?.mensaje_fuera_horario, permisos: t2.cuerpo.propuesta?.permisos }, null, 2));
if (t2.status !== 200) process.exit(1);

const antes = (await db.from("agents").select("tono, nunca_hace, version_actual").eq("id", SOFIA).single()).data;
console.log("\nAntes de aplicar, el agente sigue igual:", JSON.stringify(antes));

const ap = await verJson(await post(`/api/agentes/${SOFIA}/asistente/aplicar`, { sesionId: t1.cuerpo.sesionId }, aplicarHandler));
console.log("\n── APLICAR → HTTP", ap.status, JSON.stringify(ap.cuerpo));

const ag = (await db.from("agents").select("name, estado, version_actual, template_id, negocio_resumen, tono, objetivo, nunca_hace, instrucciones_empresa").eq("id", SOFIA).single()).data;
const reglas = (await db.from("agent_rules").select("zona_horaria, horario, fuera_de_horario, mensaje_fuera_horario, idioma").eq("agent_id", SOFIA).single()).data;
const tools = (await db.from("agent_tools").select("tool_id, permiso").eq("agent_id", SOFIA).order("tool_id")).data;
const hand = (await db.from("agent_handoffs").select("agent_id_destino, condicion, tipo_traspaso, activo").eq("agent_id_origen", SOFIA)).data;
const vers = (await db.from("agent_versions").select("version, motivo_cambio, creado_en").eq("agent_id", SOFIA).order("version")).data;
const ses = (await db.from("agent_setup_sessions").select("estado, version_base, mensajes").eq("id", t1.cuerpo.sesionId).single()).data;
const costes = (await db.from("task_costs").select("modelo, tokens_entrada, tokens_salida, coste_ia_usd_micros, creditos_cobrados, tipo_tarea").eq("agent_id", SOFIA).order("creado_en", { ascending: false }).limit(2)).data;
const saldo1 = (await db.from("company_credit_balance").select("saldo_disponible").eq("company_id", "a64499d1-7f43-4a43-abc8-41a313dc4018").single()).data!.saldo_disponible;
console.log("\n══ LO QUE QUEDA GUARDADO ══");
console.log("agents:", JSON.stringify(ag, null, 2));
console.log("agent_rules:", JSON.stringify(reglas));
console.log("agent_tools:", JSON.stringify(tools));
console.log("agent_handoffs:", JSON.stringify(hand));
console.log("agent_versions:", JSON.stringify(vers));
console.log("agent_setup_sessions:", JSON.stringify({ estado: ses?.estado, version_base: ses?.version_base, mensajes: (ses?.mensajes as unknown[]).length }));
console.log("task_costs:", JSON.stringify(costes));
console.log(`Créditos: ${saldo0} → ${saldo1} (${saldo0 - saldo1} consumidos)`);

const otra = await verJson(await post(`/api/agentes/${SOFIA}/asistente/aplicar`, { sesionId: t1.cuerpo.sesionId }, aplicarHandler));
console.log("\nAplicar otra vez la misma conversación → HTTP", otra.status, otra.cuerpo.error);
