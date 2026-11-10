/** Procesa las tareas aplazadas (mensajes que llegaron fuera de horario con «no responder») cuando abre el horario. */
import { ejecutarTarea, type EngineDeps } from "../../agents/loop.ts";

export type ResultadoAplazadas = { vencidas: number; reanudadas: number; yaTomadas: number; errores: number; resultados: { taskId: string; estado: string }[] };

/**
 * Cada tarea se reanuda de forma atómica (solo una pasada la consigue) y se ejecuta con la hora `ahora`. Si el horario aún no abrió
 * para ese agente (se cambió el horario), `ejecutarTarea` la vuelve a aplazar: nunca se pierde.
 */
export async function reanudarAplazadas(deps: EngineDeps, ahora: Date, o: { companyId?: string; limite?: number; log?: Pick<Console, "info" | "error"> } = {}): Promise<ResultadoAplazadas> {
  const log = o.log ?? console;
  const r: ResultadoAplazadas = { vencidas: 0, reanudadas: 0, yaTomadas: 0, errores: 0, resultados: [] };
  const lista = await deps.store.listarAplazadasVencidas(ahora, { companyId: o.companyId, limite: o.limite });
  r.vencidas = lista.length;
  const motor: EngineDeps = { ...deps, ahora: () => ahora };
  for (const { companyId, taskId } of lista) {
    const t = await deps.store.reanudarAplazada(companyId, taskId, ahora);
    if (!t) { r.yaTomadas++; continue; }
    r.reanudadas++;
    try {
      const res = await ejecutarTarea(motor, companyId, taskId, t.instruccion ?? undefined);
      r.resultados.push({ taskId, estado: res.estado });
    } catch (e) {
      r.errores++;
      log.error(`[aplazadas] no se pudo ejecutar la tarea ${taskId}: ${e instanceof Error ? e.name : "error"}`);
      await deps.store.updateTask(companyId, taskId, { status: "failed", reviewReason: "No se pudo procesar la tarea aplazada al abrir el horario.", finished: true }).catch(() => undefined);
    }
  }
  log.info(`[aplazadas] ${r.vencidas} vencidas, ${r.reanudadas} reanudadas, ${r.yaTomadas} ya tomadas, ${r.errores} errores.`);
  return r;
}
