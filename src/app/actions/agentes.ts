"use server";

import { after } from "next/server";
import { z } from "zod";
import { devContext } from "@/lib/devContext";
import { crearTarea, ejecutarTarea, LIMITES } from "@/lib/agents/loop";
import { motorDesdeEntorno } from "@/lib/agents/fromEnv";
import { instruccionLeadDePrueba } from "@/lib/agents/pruebas";
import { SupabaseAgentStore, type PendingDraft } from "@/lib/agents/supabaseStore";
import type { LearnedNode, TaskInfo, TaskLearning, TaskStep } from "@/lib/agents/store";
import { emailConfigFromEnv } from "@/lib/email/config";
import { ResendSender } from "@/lib/email/sender";
import { aprobarYEnviar } from "@/lib/email/service";
import { SupabaseEmailStore } from "@/lib/email/supabaseStore";
import { createClient } from "@supabase/supabase-js";
import { historialCalidadEmpresa } from "@/lib/calidad/servicio";

export type LanzarResultado =
  | { estado: "iniciada"; taskId: string; maxPasos: number; maxCosteEur: number }
  | { estado: "sin_backend" | "sin_clave" | "sin_herramientas" | "error"; mensaje: string };

/**
 * Lanza una tarea de prueba a un agente (un lead ficticio) y devuelve enseguida el id: el agente trabaja en segundo plano
 * y la interfaz consulta `verTarea` para ver paso a paso qué hace. Gasta tokens reales de tu clave de Anthropic.
 */
export async function lanzarTareaDePrueba(input: { agentSlug: string }): Promise<LanzarResultado> {
  const slug = z.string().min(1).max(100).safeParse(input.agentSlug);
  const ctx = devContext();
  if (!slug.success || !ctx || !SupabaseAgentStore.fromEnv()) return { estado: "sin_backend", mensaje: "No hay backend configurado: la ficha sigue en modo simulado." };
  const motor = motorDesdeEntorno();
  if (!motor) return { estado: "sin_clave", mensaje: "Falta ANTHROPIC_API_KEY en .env.local." };
  try {
    const agent = await motor.store.getAgentBySlug(ctx.companyId, slug.data);
    if (!agent) return { estado: "error", mensaje: "Este agente no existe en la base de datos." };
    if (!agent.instructions.trim() || !agent.allowedTools.some((t) => t === "buscar_en_memoria" || t === "redactar_correo")) {
      return { estado: "sin_herramientas", mensaje: "Este agente aún no tiene instrucciones ni herramientas del motor configuradas." };
    }
    const taskId = await crearTarea(motor.deps, ctx.companyId, { agentSlug: slug.data, title: "Tarea de prueba: lead ficticio", origen: { tipo: "orden_usuario", ordenadoPor: ctx.userId, via: "boton_tarea_de_prueba" } });
    // Se ejecuta tras responder; los pasos se guardan según ocurren y la interfaz los lee con `verTarea`.
    after(async () => {
      try {
        await ejecutarTarea(motor.deps, ctx.companyId, taskId, instruccionLeadDePrueba());
      } catch (e) {
        console.error("tarea de prueba:", e instanceof Error ? e.message : "error desconocido");
      }
    });
    return { estado: "iniciada", taskId, maxPasos: LIMITES.maxPasos, maxCosteEur: LIMITES.maxCosteEur };
  } catch (e) {
    console.error("lanzarTareaDePrueba:", e instanceof Error ? e.message : "error desconocido");
    return { estado: "error", mensaje: "No se pudo lanzar la tarea. Revisa la consola del servidor." };
  }
}

export type VistaTarea = { task: TaskInfo; steps: TaskStep[] } | null;

/** Estado y pasos de una tarea de la empresa (para verla en directo). */
export async function verTarea(taskId: string): Promise<VistaTarea> {
  const id = z.string().uuid().safeParse(taskId);
  const ctx = devContext();
  const store = SupabaseAgentStore.fromEnv();
  if (!id.success || !ctx || !store) return null;
  try {
    const task = await store.getTask(ctx.companyId, id.data);
    return task ? { task, steps: await store.listSteps(ctx.companyId, id.data) } : null;
  } catch (e) {
    console.error("verTarea:", e instanceof Error ? e.message : "error desconocido");
    return null;
  }
}

/** Borradores de correo redactados por agentes que esperan tu aprobación. */
export async function borradoresDeAgentes(): Promise<PendingDraft[]> {
  const ctx = devContext();
  const store = SupabaseAgentStore.fromEnv();
  if (!ctx || !store) return [];
  try {
    return await store.listPendingDrafts(ctx.companyId);
  } catch (e) {
    console.error("borradoresDeAgentes:", e instanceof Error ? e.message : "error desconocido");
    return [];
  }
}

export type DecisionBorrador = { estado: "enviado" | "rechazado" } | { estado: "error"; mensaje: string };

/** Aprueba el borrador tal cual se ve (texto exacto de la base) y lo envía. */
export async function aprobarBorradorDeAgente(input: { approvalId: string }): Promise<DecisionBorrador> {
  const id = z.string().uuid().safeParse(input.approvalId);
  const ctx = devContext();
  const agents = SupabaseAgentStore.fromEnv();
  const emails = SupabaseEmailStore.fromEnv();
  if (!id.success || !ctx || !agents || !emails) return { estado: "error", mensaje: "No hay backend configurado." };
  try {
    const draft = (await agents.listPendingDrafts(ctx.companyId)).find((d) => d.approvalId === id.data);
    if (!draft) return { estado: "error", mensaje: "Este borrador ya no está pendiente." };
    // El envío localiza el borrador por agente y destinatario: se comprueba que sea justo el que se ve.
    const found = await emails.findDraft(ctx.companyId, draft.agentSlug, draft.toEmail);
    if (found?.approval?.id !== id.data) {
      return { estado: "error", mensaje: "Hay otro borrador pendiente para este destinatario; resuelve primero el más reciente." };
    }
    const config = emailConfigFromEnv();
    const sender = config.apiKey ? new ResendSender(config.apiKey) : null;
    const r = await aprobarYEnviar({ store: emails, sender, config }, ctx.companyId, ctx.userId, {
      agentSlug: draft.agentSlug, toEmail: draft.toEmail, subject: draft.subject, body: draft.body,
    });
    return r.estado === "enviado" ? { estado: "enviado" } : { estado: "error", mensaje: r.mensaje };
  } catch (e) {
    console.error("aprobarBorradorDeAgente:", e instanceof Error ? e.message : "error desconocido");
    return { estado: "error", mensaje: "No se pudo enviar el correo. Revisa la consola del servidor." };
  }
}

export async function rechazarBorradorDeAgente(input: { approvalId: string }): Promise<DecisionBorrador> {
  const id = z.string().uuid().safeParse(input.approvalId);
  const ctx = devContext();
  const store = SupabaseAgentStore.fromEnv();
  if (!id.success || !ctx || !store) return { estado: "error", mensaje: "No hay backend configurado." };
  try {
    return (await store.rejectDraft(ctx.companyId, id.data, ctx.userId)) ? { estado: "rechazado" } : { estado: "error", mensaje: "Este borrador ya no está pendiente." };
  } catch (e) {
    console.error("rechazarBorradorDeAgente:", e instanceof Error ? e.message : "error desconocido");
    return { estado: "error", mensaje: "No se pudo rechazar. Revisa la consola del servidor." };
  }
}

/** Pulgar arriba/abajo de una acción: la empresa solo puede valorar una aprobación de uno de sus agentes. */
export async function valorarAprobacionDeAgente(input: { approvalId: string; valor: 1 | -1; motivo?: string }): Promise<{ ok: true } | { ok: false; mensaje: string }> {
  const v = z.object({ approvalId: z.uuid(), valor: z.union([z.literal(1), z.literal(-1)]), motivo: z.string().trim().max(1000).optional() }).strict().safeParse(input);
  const ctx = devContext();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim(), key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!v.success || !ctx || !url || !key) return { ok: false, mensaje: "No hay backend configurado." };
  const db = createClient(url, key, { auth: { persistSession: false } });
  try {
    const { data: approval, error } = await db.from("approvals").select("id, agent_id").eq("company_id", ctx.companyId).eq("id", v.data.approvalId).maybeSingle();
    if (error || !approval) return { ok: false, mensaje: "Esta acción no existe en tu empresa." };
    const { data: anterior, error: previousError } = await db.from("agent_feedback").select("id").eq("company_id", ctx.companyId).eq("user_id", ctx.userId).eq("approval_id", approval.id).maybeSingle();
    if (previousError) throw previousError;
    const row = { company_id: ctx.companyId, agent_id: approval.agent_id, approval_id: approval.id, user_id: ctx.userId, value: v.data.valor, reason: v.data.motivo?.trim() || null };
    const r = anterior ? await db.from("agent_feedback").update(row).eq("id", anterior.id) : await db.from("agent_feedback").insert(row);
    if (r.error) throw r.error;
    return { ok: true };
  } catch (e) {
    console.error("valorarAprobacionDeAgente:", e instanceof Error ? e.message : "error desconocido");
    return { ok: false, mensaje: "No se pudo guardar la valoración." };
  }
}

/** Resumen público para la empresa: no devuelve muestras, motivos ni notas internas del equipo revisor. */
export async function historialDeCalidadDeAgente(agentSlug: string) {
  const slug = z.string().min(1).max(100).safeParse(agentSlug);
  const ctx = devContext();
  const store = SupabaseAgentStore.fromEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim(), key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!slug.success || !ctx || !store || !url || !key) return null;
  try {
    const agent = await store.getAgentBySlug(ctx.companyId, slug.data);
    return agent ? await historialCalidadEmpresa(createClient(url, key, { auth: { persistSession: false } }), ctx.companyId, agent.id) : null;
  } catch (e) {
    console.error("historialDeCalidadDeAgente:", e instanceof Error ? e.message : "error desconocido");
    return null;
  }
}

/** Lo que la oficina recordó al terminar una tarea (solo lo nuevo; lo que ya constaba no se cuenta). */
export async function aprendizajeDeTarea(taskId: string): Promise<LearnedNode[]> {
  const id = z.string().uuid().safeParse(taskId);
  const ctx = devContext();
  const store = SupabaseAgentStore.fromEnv();
  if (!id.success || !ctx || !store) return [];
  try {
    return await store.listLearned(ctx.companyId, id.data);
  } catch (e) {
    console.error("aprendizajeDeTarea:", e instanceof Error ? e.message : "error desconocido");
    return [];
  }
}

/** Lo aprendido en las últimas tareas de un agente. */
export async function recuerdosRecientes(agentSlug: string): Promise<TaskLearning[]> {
  const slug = z.string().min(1).max(100).safeParse(agentSlug);
  const ctx = devContext();
  const store = SupabaseAgentStore.fromEnv();
  if (!slug.success || !ctx || !store) return [];
  try {
    const agent = await store.getAgentBySlug(ctx.companyId, slug.data);
    return agent ? await store.recentLearning(ctx.companyId, agent.id, 5) : [];
  } catch (e) {
    console.error("recuerdosRecientes:", e instanceof Error ? e.message : "error desconocido");
    return [];
  }
}

// ── Simulador ────────────────────────────────────────────────────────────────────────────────────
import { CANALES, type Canal } from "@/lib/agentes/simulador/esquemas";
import { depsSimuladorDesdeEntorno } from "@/lib/agentes/simulador/api";
import { probarCasosDePlantilla, SimuladorError, simularAgente, type ResultadoCasos, type ResultadoSimulacion } from "@/lib/agentes/simulador/servicio";

export type SimulacionVista = { ok: true; resultado: ResultadoSimulacion } | { ok: false; mensaje: string };
export type CasosVista = { ok: true; resultado: ResultadoCasos } | { ok: false; mensaje: string };

type Preparado = { error: string } | { error?: undefined; api: NonNullable<ReturnType<typeof depsSimuladorDesdeEntorno>>; ctx: { companyId: string; userId: string }; agent: { id: string } };
async function prepararSimulador(agentSlug: string): Promise<Preparado> {
  const slug = z.string().min(1).max(100).safeParse(agentSlug);
  const ctx = devContext();
  if (!slug.success || !ctx) return { error: "No hay backend configurado: el simulador solo funciona con el backend real." };
  const api = depsSimuladorDesdeEntorno();
  if (!api) return { error: "El simulador necesita la base de datos y ANTHROPIC_API_KEY en .env.local." };
  const agent = await api.deps.engine.store.getAgentBySlug(ctx.companyId, slug.data);
  if (!agent) return { error: "Este agente no existe en la base de datos." };
  return { api, ctx, agent };
}
const mensajeDeError = (e: unknown) => (e instanceof SimuladorError ? e.message : "No se pudo completar la simulación. Revisa la consola del servidor.");

/** Simula al agente con un mensaje (sin efectos reales). Misma lógica que POST /api/agentes/[id]/simular. */
export async function simularConAgente(input: { agentSlug: string; mensaje: string; canal: Canal }): Promise<SimulacionVista> {
  const v = z.object({ mensaje: z.string().trim().min(1).max(4000), canal: z.enum(CANALES) }).safeParse(input);
  if (!v.success) return { ok: false, mensaje: "Escribe un mensaje (hasta 4.000 caracteres)." };
  try {
    const p = await prepararSimulador(input.agentSlug);
    if (p.error !== undefined) return { ok: false, mensaje: p.error };
    return { ok: true, resultado: await simularAgente(p.api.deps, { companyId: p.ctx.companyId, agentId: p.agent.id, ordenadoPor: p.ctx.userId, ...v.data }) };
  } catch (e) {
    console.error("simularConAgente:", e instanceof Error ? e.message : "error desconocido");
    return { ok: false, mensaje: mensajeDeError(e) };
  }
}

/** Ejecuta los casos de prueba de la plantilla del agente y marca cuáles cumplen. */
export async function probarCasosDeAgente(input: { agentSlug: string }): Promise<CasosVista> {
  try {
    const p = await prepararSimulador(input.agentSlug);
    if (p.error !== undefined) return { ok: false, mensaje: p.error };
    return { ok: true, resultado: await probarCasosDePlantilla(p.api.deps, { companyId: p.ctx.companyId, agentId: p.agent.id, ordenadoPor: p.ctx.userId }) };
  } catch (e) {
    console.error("probarCasosDeAgente:", e instanceof Error ? e.message : "error desconocido");
    return { ok: false, mensaje: mensajeDeError(e) };
  }
}
