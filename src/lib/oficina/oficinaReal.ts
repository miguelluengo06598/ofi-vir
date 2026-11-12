/**
 * La oficina real en la forma que usan las vistas (la misma que `buildOffice` de los datos de ejemplo de la web pública).
 * Sin código de servidor: lo usa el navegador. Los datos los carga `estadoReal.ts` en el servidor.
 */
import type { DepartmentId } from "@/components/glass/tokens";
import type { Agent } from "@/data/agents";
import type { DepartmentSummary, OfficeAgent } from "@/data/departments";

export type MetricaDepartamento = { label: string; value: string };
export type OficinaReal = {
  /** Nombre de la persona que ha entrado (para el saludo). */
  usuario: string;
  agentes: Agent[];
  /** Aprobaciones pendientes por agente (borradores, citas, mensajes… que esperan a una persona). */
  pendientesPorAgente: Record<string, number>;
  /** Total pendiente de decidir en la oficina: aprobaciones + seguimientos propuestos. */
  pendientes: number;
  metricas: Record<DepartmentId, MetricaDepartamento[]>;
  /** Por agente (slug): tareas terminadas en 7 días y % de valoraciones positivas de la empresa (null si no hay). */
  estadisticas: Record<string, EstadisticasAgente>;
};
export type EstadisticasAgente = { tareasSemana: number; positivas: number | null; valoraciones: number };

/** Lo que hace un agente activo sin ninguna tarea en curso (no cuenta como «trabajando»). */
export const SIN_TRABAJO = "esperando trabajo";

const ORDEN: DepartmentId[] = ["ventas", "atencion", "marketing", "operaciones", "direccion"];

export function construirOficinaReal(o: OficinaReal) {
  const agentes: OfficeAgent[] = o.agentes.map((a) => ({ ...a, pendingApprovals: o.pendientesPorAgente[a.id] ?? 0, currentTask: a.task }));
  const summaries: DepartmentSummary[] = ORDEN.map((id) => {
    const miembros = agentes.filter((a) => a.departmentId === id);
    return {
      id, agents: miembros, pending: [],
      pendingApprovals: miembros.reduce((n, a) => n + a.pendingApprovals, 0),
      creditsToday: miembros.reduce((n, a) => n + a.creditsToday, 0),
    };
  });
  return {
    summaries,
    totals: {
      agents: agentes.length,
      working: agentes.filter((a) => a.status === "working" && a.task !== SIN_TRABAJO).length,
      pendingApprovals: o.pendientes,
    },
  };
}
