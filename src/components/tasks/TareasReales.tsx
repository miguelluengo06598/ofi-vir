"use client";

import { ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";
import { GlassPanel } from "@/components/glass";
import { llamar } from "@/components/oficina/llamar";

type Eslabon = { taskId: string; titulo: string; agente: string; porque: string };
type Tarea = { id: string; titulo: string; estado: string; agente: string; empezo: string; porque: string; motivoRevision: string | null; cadena: Eslabon[] };

const ESTADO: Record<string, string> = {
  running: "En curso", approval: "Espera aprobación", done: "Hecha", review: "En revisión", failed: "Con error", scheduled: "Programada", expert: "Con el experto",
};
const HORA = (iso: string) => new Date(iso).toLocaleString("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/**
 * Tareas reales (de la base) con por qué empezó cada una y su cadena desde el origen («Lead nuevo de Meta → Sara → Lucía»).
 * Sin backend, no muestra nada (la vista sigue con los datos de ejemplo).
 */
export function TareasReales({ vacio = false }: { vacio?: boolean }) {
  const [tareas, setTareas] = useState<Tarea[] | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => { void llamar<{ tareas: Tarea[] }>("/api/tareas").then((r) => (r.ok ? setTareas(r.datos.tareas) : setError(true))); }, []);
  if (vacio && (error || (tareas && tareas.length === 0))) {
    return (
      <GlassPanel className="enter flex flex-col gap-2 p-6">
        <h2 className="text-h2">{error ? "No se han podido cargar las tareas" : "Todavía no hay tareas"}</h2>
        <p className="text-small text-ink-2">
          {error
            ? "Vuelve a intentarlo en unos segundos."
            : "Tus agentes solo trabajan cuando hay un motivo: un lead o un correo que llega, una orden vuestra, una rutina que activéis o un seguimiento aprobado. Cuando pase, la tarea aparecerá aquí con por qué empezó."}
        </p>
      </GlassPanel>
    );
  }
  if (vacio && !tareas) return <p className="text-small text-ink-2" aria-live="polite">Cargando tareas…</p>;
  if (!tareas || tareas.length === 0) return null;
  return (
    <GlassPanel as="section" aria-labelledby="tareas-reales" className="enter flex flex-col gap-2 p-6">
      <h2 id="tareas-reales" className="text-h2">Últimas tareas de tus agentes</h2>
      <p className="text-small text-ink-2">Cada tarea dice por qué empezó: los agentes solo trabajan por algo que llega de fuera, una orden vuestra, una rutina que activasteis, un traspaso o un seguimiento aprobado.</p>
      <ul>
        {tareas.map((t) => (
          <li key={t.id} className="flex flex-col gap-1 border-t border-glass-border py-3 first:border-t-0">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4">
              <p className="text-small font-semibold">{t.titulo}</p>
              <p className="text-tiny text-ink-2">{ESTADO[t.estado] ?? t.estado} · {HORA(t.empezo)}</p>
            </div>
            <p className="text-tiny text-ink-2">{t.agente} · <span className="text-white">Empezó por: {t.porque}</span></p>
            {t.cadena.length > 1 && (
              <ol aria-label="Cadena desde el origen" className="flex flex-wrap items-center gap-1 text-tiny text-ink-3">
                {t.cadena.map((e, i) => (
                  <li key={e.taskId} className="inline-flex items-center gap-1">
                    {i > 0 && <ChevronRight size={12} aria-hidden="true" />}
                    <span>{i === 0 ? `${e.porque} → ${e.agente}` : e.agente}</span>
                  </li>
                ))}
              </ol>
            )}
            {t.estado === "review" && t.motivoRevision && <p className="text-tiny text-status-waiting">{t.motivoRevision}</p>}
          </li>
        ))}
      </ul>
    </GlassPanel>
  );
}
