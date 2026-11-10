/** Procesa las tareas que nacieron de un traspaso (la ficha es su entrada): cada agente destino trabaja con lo que le pasaron. */
import { ejecutarTarea, type EngineDeps } from "../../agents/loop.ts";

export type ResultadoTraspasos = { ejecutadas: number; errores: number; resultados: { taskId: string; estado: string }[] };

/**
 * Ejecuta las tareas de traspaso pendientes. Una tarea puede crear traspasos nuevos (Sara → Lucía → Iván): se sigue hasta que no
 * quede ninguna o se alcanza `maxTareas`. La cadena tiene su propio límite (`MAX_TRASPASOS_POR_CADENA`), así que no puede ser infinito.
 */
export async function procesarTraspasos(deps: EngineDeps, o: { companyId?: string; maxTareas?: number; log?: Pick<Console, "info" | "error"> } = {}): Promise<ResultadoTraspasos> {
  const log = o.log ?? console;
  const max = o.maxTareas ?? 30;
  const r: ResultadoTraspasos = { ejecutadas: 0, errores: 0, resultados: [] };
  while (r.ejecutadas + r.errores < max) {
    const [siguiente] = await deps.store.listarTareasDeTraspasoPendientes({ companyId: o.companyId, limite: 1 });
    if (!siguiente) break;
    try {
      const res = await ejecutarTarea(deps, siguiente.companyId, siguiente.taskId);
      r.ejecutadas++;
      r.resultados.push({ taskId: siguiente.taskId, estado: res.estado });
    } catch (e) {
      r.errores++;
      log.error(`[traspasos] no se pudo ejecutar la tarea ${siguiente.taskId}: ${e instanceof Error ? e.name : "error"}`);
      await deps.store.updateTask(siguiente.companyId, siguiente.taskId, { status: "failed", reviewReason: "No se pudo procesar la tarea del traspaso.", finished: true }).catch(() => undefined);
    }
  }
  if (r.ejecutadas || r.errores) log.info(`[traspasos] ${r.ejecutadas} tareas de traspaso ejecutadas, ${r.errores} errores.`);
  return r;
}
