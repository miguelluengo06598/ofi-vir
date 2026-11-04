"use client";

import { useEffect, useState } from "react";
import { recuerdosRecientes } from "@/app/actions/agentes";
import type { TaskLearning } from "@/lib/agents/store";
import { Aprendido } from "./Aprendido";

/** Lo que este agente ha aprendido en sus últimas tareas reales (vacío si aún no ha ejecutado ninguna). */
export function RecuerdosRecientes({ agentSlug, agentName }: { agentSlug: string; agentName: string }) {
  const [items, setItems] = useState<TaskLearning[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    recuerdosRecientes(agentSlug).then((r) => !cancelled && setItems(r)).catch(() => !cancelled && setItems([]));
    return () => {
      cancelled = true;
    };
  }, [agentSlug]);

  if (items === null) return <p className="text-small text-ink-3">Cargando…</p>;
  if (items.length === 0) return <p className="text-small text-ink-3">Aún no ha guardado nada en la memoria. Lanza una tarea de prueba para verlo.</p>;
  return (
    <div className="flex flex-col gap-4">
      {items.map((t) => (
        <Aprendido key={t.taskId} nombre={agentName} items={t.items} titulo={t.taskTitle} />
      ))}
    </div>
  );
}
