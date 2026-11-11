/**
 * La ÚNICA puerta para que un agente trabaje: `puedeEjecutarse`. El motor la llama al empezar la tarea y justo antes de CADA
 * llamada a la API de Claude (también la del paso de memoria). Lo decide el código, nunca la IA.
 *
 * Comprueba, en este orden:
 *  1. AGENTES_ACTIVOS (variable de entorno): con `false` no se ejecuta ningún agente, diga lo que diga la base.
 *  2. Parada de emergencia global de MyOfia: detiene también las tareas en curso en su siguiente paso.
 *  3. Oficina pausada por la empresa: no empieza ninguna tarea nueva (las que ya están en marcha terminan).
 *  4. Origen válido: toda tarea tiene un origen con su referencia (evento, traspaso, orden, rutina o seguimiento aprobado).
 *  5. Cadena válida: un traspaso tiene tarea padre y su cadena llega a una raíz válida (evento, orden, rutina o seguimiento).
 *  6. Agente activo y con la certificación vigente (solo tareas reales).
 *  7. Oficina operativa: con saldo (activa o saldo bajo), no sin saldo, pausada por inactividad ni pendiente de borrado.
 * Los bloqueos 1-3 son transitorios: una tarea de la cola (evento, traspaso, rutina, seguimiento) espera y se procesa al reanudar.
 */
import { ORIGENES, ORIGENES_RAIZ, type AgentStore, type EslabonCadena, type TaskInfo } from "./store.ts";

export type FaseEjecucion = "inicio" | "paso";
export type Bloqueo = { codigo: string; motivo: string; transitorio: boolean };
export type DecisionPuerta = { ok: true } | ({ ok: false } & Bloqueo);

export type DepsPuerta = {
  store: Pick<AgentStore, "cadenaDeTarea" | "controlDeEjecucion">;
  puedeTrabajar?: (companyId: string, agentId: string) => Promise<boolean>;
  oficinaActiva?: (companyId: string) => Promise<boolean>;
  env?: Record<string, string | undefined>;
  /** Simulador o examen: sin efectos reales; solo cuentan los interruptores globales, el origen y la cadena. */
  esSimulacion?: boolean;
};

/** AGENTES_ACTIVOS=false apaga todos los agentes. Sin definir (o cualquier otro valor) = encendidos. */
export const agentesActivosPorEntorno = (env: Record<string, string | undefined> = process.env) => env.AGENTES_ACTIVOS?.trim().toLowerCase() !== "false";

const bloqueo = (codigo: string, motivo: string, transitorio = false): DecisionPuerta => ({ ok: false, codigo, motivo, transitorio });

/** ¿El origen guardado en la tarea es uno válido y trae su referencia obligatoria? */
export function validarOrigen(t: Pick<TaskInfo, "origen" | "sourceEmailId" | "esSimulacion">): Bloqueo | null {
  const o = t.origen;
  const mal = (motivo: string): Bloqueo => ({ codigo: "origen_invalido", motivo, transitorio: false });
  if (!o.tipo) return { codigo: "sin_origen", motivo: "La tarea no tiene origen: los agentes solo trabajan por un evento, un traspaso, una orden, una rutina activada o un seguimiento aprobado.", transitorio: false };
  if (!(ORIGENES as readonly string[]).includes(o.tipo)) return mal(`Origen desconocido («${String(o.tipo).slice(0, 30)}»).`);
  if (t.esSimulacion && o.tipo !== "orden_usuario") return mal("Una simulación solo puede ser una orden de una persona.");
  switch (o.tipo) {
    case "evento_externo": return o.eventoId || t.sourceEmailId ? null : mal("El evento externo no tiene referencia.");
    case "traspaso": return o.tareaPadreId ? null : mal("El traspaso no tiene tarea padre.");
    case "orden_usuario": return o.ordenadoPor || (t.esSimulacion && typeof o.ref.proceso_interno === "string") ? null : mal("La orden no dice qué persona la dio.");
    case "rutina_usuario": return o.rutinaId ? null : mal("La tarea de rutina no tiene rutina.");
    case "seguimiento_aprobado": return o.seguimientoId ? null : mal("El seguimiento no tiene referencia.");
  }
}

/** La cadena (tarea → padre → … → raíz) debe terminar en un origen raíz válido, sin eslabones rotos. */
export function validarCadena(cadena: EslabonCadena[]): Bloqueo | null {
  const rota = (motivo: string): Bloqueo => ({ codigo: "cadena_invalida", motivo, transitorio: false });
  if (cadena.length === 0) return rota("La tarea no existe.");
  for (let i = 0; i < cadena.length; i++) {
    const e = cadena[i];
    if (!e.origen) return rota(`La cadena llega a una tarea sin origen («${e.title.slice(0, 60)}»): no lleva a un evento, una orden o una rutina.`);
    if (e.origen === "traspaso") {
      if (!e.tareaPadreId || !cadena[i + 1]) return rota("La cadena de traspasos está rota: no lleva a la tarea que la empezó.");
      if (cadena[i + 1].agentId === e.agentId) return rota("Un agente no puede encargarse trabajo a sí mismo.");
      continue;
    }
    if (ORIGENES_RAIZ.includes(e.origen)) return null;
    return rota("Origen desconocido en la cadena.");
  }
  return rota("La cadena no llega a un origen válido.");
}

export async function puedeEjecutarse(deps: DepsPuerta, companyId: string, task: TaskInfo, fase: FaseEjecucion): Promise<DecisionPuerta> {
  if (!agentesActivosPorEntorno(deps.env)) return bloqueo("agentes_desactivados", "Los agentes están desactivados en este servidor (AGENTES_ACTIVOS=false).", true);
  const control = await deps.store.controlDeEjecucion(companyId);
  if (control.paradaEmergencia) return bloqueo("parada_emergencia", `Parada de emergencia de MyOfia activa${control.motivoParada ? `: ${control.motivoParada}` : ""}.`, true);
  if (fase === "inicio" && !deps.esSimulacion && control.oficinaPausada) return bloqueo("oficina_pausada", "La oficina está pausada por la empresa: no empieza ninguna tarea nueva.", true);

  const o = validarOrigen(task);
  if (o) return { ok: false, ...o };
  const c = validarCadena(await deps.store.cadenaDeTarea(companyId, task.id));
  if (c) return { ok: false, ...c };

  if (fase === "inicio" && !deps.esSimulacion) {
    if (deps.puedeTrabajar && !(await deps.puedeTrabajar(companyId, task.agentId))) {
      return bloqueo("agente_no_certificado", "El agente no puede trabajar con datos reales: solo un agente activo con la certificación vigente ejecuta tareas. La tarea no se ha ejecutado.");
    }
    if (deps.oficinaActiva && !(await deps.oficinaActiva(companyId))) {
      return bloqueo("oficina_no_operativa", "La oficina no está activa (sin saldo, pausada o pendiente de borrado): la tarea no se ha ejecutado.");
    }
  }
  return { ok: true };
}
