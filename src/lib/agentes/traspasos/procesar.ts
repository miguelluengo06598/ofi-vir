/**
 * La cola de trabajo: ejecuta las tareas que esperan y que tienen un motivo concreto (un evento externo, un traspaso, una rutina
 * activada por una persona o un seguimiento aprobado). NUNCA busca trabajo ni lanza a un agente «para que revise»: solo ejecuta
 * tareas que ya existen con su origen. Las órdenes de una persona se ejecutan al pedirlas, no aquí.
 */
import { ejecutarTarea, type EngineDeps } from "../../agents/loop.ts";

export type ResultadoTraspasos = { ejecutadas: number; errores: number; bloqueadas: number; resultados: { taskId: string; estado: string }[] };

/**
 * Ejecuta las tareas pendientes. Una tarea puede crear traspasos nuevos (Sara → Lucía → Iván): se sigue hasta que no quede ninguna o
 * se alcanza `maxTareas`. La cadena tiene su propio límite (`MAX_TRASPASOS_POR_CADENA`) y termina cuando el último agente no pasa el
 * trabajo a nadie. Si la puerta de ejecución bloquea una tarea por un motivo transitorio (agentes apagados, parada de emergencia,
 * oficina pausada), la pasada se detiene: esa tarea seguiría primera en la cola.
 */
export async function procesarTareasPendientes(deps: EngineDeps, o: { companyId?: string; maxTareas?: number; log?: Pick<Console, "info" | "error"> } = {}): Promise<ResultadoTraspasos> {
  const log = o.log ?? console;
  const max = o.maxTareas ?? 30;
  const r: ResultadoTraspasos = { ejecutadas: 0, errores: 0, bloqueadas: 0, resultados: [] };
  while (r.ejecutadas + r.errores < max) {
    const [siguiente] = await deps.store.listarTareasPendientes({ companyId: o.companyId, limite: 1 });
    if (!siguiente) break;
    try {
      const res = await ejecutarTarea(deps, siguiente.companyId, siguiente.taskId);
      if (res.estado === "bloqueada") {
        r.bloqueadas++;
        log.info(`[cola] detenida: ${res.motivo}`);
        break;
      }
      r.ejecutadas++;
      r.resultados.push({ taskId: siguiente.taskId, estado: res.estado });
    } catch (e) {
      r.errores++;
      log.error(`[cola] no se pudo ejecutar la tarea ${siguiente.taskId}: ${e instanceof Error ? e.name : "error"}`);
      await deps.store.updateTask(siguiente.companyId, siguiente.taskId, { status: "failed", reviewReason: "No se pudo procesar la tarea.", finished: true }).catch(() => undefined);
    }
  }
  if (r.ejecutadas || r.errores) log.info(`[cola] ${r.ejecutadas} tareas ejecutadas, ${r.errores} errores.`);
  return r;
}

/** Nombre anterior (las tareas de traspaso son parte de la cola). */
export const procesarTraspasos = procesarTareasPendientes;
