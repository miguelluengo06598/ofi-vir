/** Origen de las tareas: cómo se guarda en `tasks` y cómo se cuenta a la persona («Lead nuevo de Meta», «Traspaso de Sara»…). */
import type { EslabonCadena, OrigenNuevo, OrigenTarea, TipoOrigen } from "./store.ts";

/** Columnas de `tasks` para un origen nuevo (la base vuelve a comprobarlas en `tasks_origen_validar`). */
export function columnasDeOrigen(o: OrigenNuevo): Record<string, unknown> {
  switch (o.tipo) {
    case "evento_externo": return { origen: o.tipo, evento_id: o.eventoId ?? null, source_email_id: o.emailId ?? null, origen_ref: { canal: o.canal } };
    case "traspaso": return { origen: o.tipo, tarea_padre_id: o.tareaPadreId };
    case "orden_usuario":
      return "procesoInterno" in o
        ? { origen: o.tipo, ordenado_por: null, origen_ref: { proceso_interno: o.procesoInterno, ...(o.solicitudId ? { solicitud_id: o.solicitudId } : {}) } }
        : { origen: o.tipo, ordenado_por: o.ordenadoPor, origen_ref: o.via ? { via: o.via } : {} };
    case "rutina_usuario": return { origen: o.tipo, rutina_id: o.rutinaId };
    case "seguimiento_aprobado": return { origen: o.tipo, seguimiento_id: o.seguimientoId };
  }
}

/** Lo mismo que hace la base al insertar, para el almacén en memoria de los tests. */
export function origenGuardado(o: OrigenNuevo): OrigenTarea {
  const c = columnasDeOrigen(o);
  return {
    tipo: o.tipo, ref: (c.origen_ref as Record<string, unknown>) ?? {}, eventoId: (c.evento_id as string | null) ?? null,
    tareaPadreId: (c.tarea_padre_id as string | null) ?? null, tareaRaizId: null, ordenadoPor: (c.ordenado_por as string | null) ?? null,
    ordenadoEn: o.tipo === "orden_usuario" ? new Date().toISOString() : null, rutinaId: (c.rutina_id as string | null) ?? null,
    seguimientoId: (c.seguimiento_id as string | null) ?? null,
  };
}

/** Fila de `tasks` → origen. */
export const origenDeFila = (r: Record<string, unknown>): OrigenTarea => ({
  tipo: (r.origen as TipoOrigen | null) ?? null, ref: (r.origen_ref as Record<string, unknown> | null) ?? {}, eventoId: (r.evento_id as string | null) ?? null,
  tareaPadreId: (r.tarea_padre_id as string | null) ?? null, tareaRaizId: (r.tarea_raiz_id as string | null) ?? null,
  ordenadoPor: (r.ordenado_por as string | null) ?? null, ordenadoEn: (r.ordenado_en as string | null) ?? null,
  rutinaId: (r.rutina_id as string | null) ?? null, seguimientoId: (r.seguimiento_id as string | null) ?? null,
});

const CANAL: Record<string, string> = {
  correo: "Correo recibido", whatsapp: "Mensaje de WhatsApp", meta_lead: "Lead nuevo de Meta", formulario: "Formulario de la web", otro: "Evento externo",
};

/** Nombres que hacen falta para contar el origen (los resuelve quien llama: agentes, personas, rutinas). */
export type NombresOrigen = {
  agente?: (id: string) => string | undefined;
  persona?: (id: string) => string | undefined;
  rutina?: (id: string) => string | undefined;
};

/** «Por qué empezó» esta tarea, en una línea para la persona. */
export function describirOrigen(
  t: { origen: TipoOrigen | null; ref: Record<string, unknown>; ordenadoPor: string | null; rutinaId: string | null; sourceEmailId?: string | null },
  padre: { agentId: string } | null,
  n: NombresOrigen = {},
): string {
  switch (t.origen) {
    case "evento_externo": return CANAL[String(t.ref.canal ?? (t.sourceEmailId ? "correo" : "otro"))] ?? "Evento externo";
    case "traspaso": return `Traspaso de ${(padre && n.agente?.(padre.agentId)) ?? "otro agente"}`;
    case "orden_usuario":
      if (!t.ordenadoPor && typeof t.ref.proceso_interno === "string") return "Examen de certificación (proceso interno)";
      return `Orden de ${(t.ordenadoPor && n.persona?.(t.ordenadoPor)) ?? "una persona"}`;
    case "rutina_usuario": return `Rutina: ${(t.rutinaId && n.rutina?.(t.rutinaId)) ?? "rutina programada"}`;
    case "seguimiento_aprobado": return "Seguimiento aprobado por una persona";
    default: return "Sin origen (no se ejecuta)";
  }
}

/** La cadena desde su origen (raíz primero) con el motivo de cada eslabón. */
export function cadenaDesdeOrigen(cadena: EslabonCadena[], n: NombresOrigen = {}) {
  const raizPrimero = [...cadena].sort((a, b) => b.nivel - a.nivel);
  return raizPrimero.map((e, i) => ({
    taskId: e.taskId, titulo: e.title, agente: n.agente?.(e.agentId) ?? "Agente", empezo: e.startedAt,
    porque: describirOrigen({ origen: e.origen, ref: e.ref, ordenadoPor: e.ordenadoPor, rutinaId: e.rutinaId, sourceEmailId: e.sourceEmailId }, i > 0 ? raizPrimero[i - 1] : null, n),
  }));
}
