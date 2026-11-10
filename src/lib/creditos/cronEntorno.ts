/** Configuración compartida por la ruta de API y el script de las tareas periódicas. Solo servidor. */
import { createHash, timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { crearServicioCreditos } from "./servicio.ts";
import type { DepsTareas } from "./tareasPeriodicas.ts";
import { motorDesdeEntorno } from "../agents/fromEnv.ts";
import { reanudarAplazadas } from "../agentes/reglas/aplazadas.ts";
import { procesarTraspasos } from "../agentes/traspasos/procesar.ts";
import { depsExamenDesdeEntorno } from "../certificacion/entorno.ts";
import { procesarExamenesPendientes } from "../certificacion/examen.ts";
import { AnthropicLlm } from "../agents/anthropicClient.ts";
import { evaluarMuestrasPendientes } from "../calidad/servicio.ts";

export type Autorizacion = { ok: true } | { ok: false; status: 401 | 503; motivo: string };

/**
 * Comprueba `Authorization: Bearer <CRON_SECRET>` (es lo que envía Vercel Cron cuando CRON_SECRET está definido).
 * Sin CRON_SECRET (o demasiado corto) las rutas están CERRADAS: nunca se ejecutan sin clave.
 */
export function autorizarCron(authorization: string | null, env: Record<string, string | undefined> = process.env): Autorizacion {
  const secreto = env.CRON_SECRET?.trim() ?? "";
  if (secreto.length < 16) return { ok: false, status: 503, motivo: "CRON_SECRET no está configurado (mínimo 16 caracteres)." };
  const dado = /^Bearer (.+)$/.exec(authorization ?? "")?.[1] ?? "";
  const h = (s: string) => createHash("sha256").update(s).digest();
  return timingSafeEqual(h(dado), h(secreto)) ? { ok: true } : { ok: false, status: 401, motivo: "No autorizado." };
}

export const esProduccion = (env: Record<string, string | undefined> = process.env) => env.NODE_ENV === "production";

/** Dependencias de las tareas con Supabase (clave de servicio) del entorno. Lanza si falta la configuración. */
export function depsDesdeEntorno(ahora: Date, env: Record<string, string | undefined> = process.env): DepsTareas {
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.");
  const db = createClient(url, key, { auth: { persistSession: false } });
  const esLocal = !esProduccion(env) && /^https?:\/\/(127\.0\.0\.1|localhost)[:/]/.test(url);
  // Las tareas aplazadas por horario necesitan el motor de agentes (Claude): sin clave de Anthropic, `abrir-aplazadas` solo informa.
  const motor = motorDesdeEntorno();
  const procesarAplazadas = motor ? (a: Date, empresaId?: string) => reanudarAplazadas(motor.deps, a, { companyId: empresaId }) : undefined;
  const procesarTraspasosDeMotor = motor ? (empresaId?: string) => procesarTraspasos(motor.deps, { companyId: empresaId }) : undefined;
  const examen = depsExamenDesdeEntorno(env);
  const procesarExamenes = examen ? (empresaId?: string) => procesarExamenesPendientes(examen, { companyId: empresaId }) : undefined;
  const haiku = AnthropicLlm.fromEnv();
  const procesarMuestrasCalidad = haiku ? (empresaId?: string) => evaluarMuestrasPendientes(db, haiku, { companyId: empresaId, ahora }) : undefined;
  return { db, servicio: crearServicioCreditos({ db, esLocal }), ahora, esLocal, procesarAplazadas, procesarTraspasos: procesarTraspasosDeMotor, procesarExamenes, procesarMuestrasCalidad };
}
