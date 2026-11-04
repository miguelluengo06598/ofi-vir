"use client";

import { FlaskConical, Loader2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { aprendizajeDeTarea, lanzarTareaDePrueba, verTarea, type VistaTarea } from "@/app/actions/agentes";
import type { LearnedNode } from "@/lib/agents/store";
import { Aprendido } from "./Aprendido";
import { PillButton } from "@/components/glass";

const eur = (n: number) => n.toLocaleString("es-ES", { minimumFractionDigits: 4, maximumFractionDigits: 4 });
const tokens = (n: number) => n.toLocaleString("es-ES");

const estadoTexto: Record<string, string> = {
  running: "Trabajando…",
  done: "Terminada",
  review: "Parada: pendiente de revisión",
  failed: "Fallida",
  approval: "Esperando aprobación",
  expert: "Esperando al experto",
};

/** Etiqueta de cada paso, siempre con texto (nunca solo color). */
function etiqueta(kind: string, tool: string | null) {
  if (kind === "instruccion") return "Tarea recibida";
  if (kind === "respuesta") return "El agente piensa";
  if (kind === "memoria") return "Memoria · lo que se queda";
  if (kind === "herramienta") return `Herramienta · ${tool}`;
  return "Final";
}

/**
 * Botón «Lanzar tarea de prueba» de la ficha del agente: le da un lead ficticio y muestra paso a paso lo que hace
 * (qué piensa, qué herramientas usa, qué le devuelven), con los tokens y el coste en euros de la tarea.
 */
export function TareaDePrueba({ agentSlug, agentName }: { agentSlug: string; agentName: string }) {
  const [launching, setLaunching] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [view, setView] = useState<VistaTarea>(null);
  const [limits, setLimits] = useState<{ maxPasos: number; maxCosteEur: number } | null>(null);
  const [learned, setLearned] = useState<LearnedNode[]>([]);
  const stopped = useRef(false);
  const status = view?.task.status;

  const running = taskId !== null && (view === null || view.task.status === "running");

  useEffect(() => {
    if (!taskId) return;
    stopped.current = false;
    const tick = async () => {
      const v = await verTarea(taskId);
      if (stopped.current) return;
      setView(v);
      if (!v || v.task.status !== "running") return;
      timer = setTimeout(tick, 1500);
    };
    let timer = setTimeout(tick, 600);
    return () => {
      stopped.current = true;
      clearTimeout(timer);
    };
  }, [taskId]);

  useEffect(() => {
    if (!taskId || !status || status === "running") return;
    let cancelled = false;
    aprendizajeDeTarea(taskId).then((r) => !cancelled && setLearned(r)).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [taskId, status]);

  const launch = useCallback(async () => {
    setLaunching(true);
    setMessage(null);
    setView(null);
    setLearned([]);
    setTaskId(null);
    try {
      const r = await lanzarTareaDePrueba({ agentSlug });
      if (r.estado === "iniciada") {
        setTaskId(r.taskId);
        setLimits({ maxPasos: r.maxPasos, maxCosteEur: r.maxCosteEur });
      } else setMessage(r.mensaje);
    } catch {
      setMessage("No se pudo contactar con el servidor.");
    } finally {
      setLaunching(false);
    }
  }, [agentSlug]);

  return (
    <div className="flex flex-col gap-3">
      <PillButton icon={launching || running ? Loader2 : FlaskConical} disabled={launching || running} onClick={launch} className="w-full justify-center">
        {running ? "El agente está trabajando…" : "Lanzar tarea de prueba"}
      </PillButton>
      <p className="text-tiny text-ink-3">
        Le pasa un lead ficticio y gasta tokens reales de tu clave de Anthropic (también el paso final con Haiku que guarda lo aprendido). Límite por tarea: {limits?.maxPasos ?? 8} pasos y{" "}
        {(limits?.maxCosteEur ?? 0.2).toLocaleString("es-ES", { minimumFractionDigits: 2 })} €.
      </p>
      {message && (
        <p role="status" className="text-small text-ink-2">
          {message}
        </p>
      )}

      {view && (
        <div className="flex flex-col gap-2" aria-live="polite">
          <p className="text-small font-semibold">
            {estadoTexto[view.task.status] ?? view.task.status}
            {view.task.reviewReason ? ` · ${view.task.reviewReason}` : ""}
          </p>
          <ol aria-label="Pasos de la tarea" className="flex flex-col gap-2">
            {view.steps.map((s) => (
              <li key={s.position} className="rounded-card bg-white/6 p-3 text-small">
                <p className="flex flex-wrap items-center gap-x-2 text-tiny text-ink-3">
                  <span className="font-semibold text-ink-2">
                    {s.step > 0 ? `Paso ${s.step} · ` : ""}
                    {etiqueta(s.kind, s.toolName)}
                  </span>
                  {s.isError && <span className="text-ink-2">· con error</span>}
                  {(s.kind === "respuesta" || s.kind === "memoria") && (
                    <span>
                      · {tokens(s.usage.inputTokens)} entrada · {tokens(s.usage.outputTokens)} salida · {tokens(s.usage.cacheReadTokens)} caché leída ·{" "}
                      {eur(s.costEur)} €
                    </span>
                  )}
                </p>
                {s.kind === "herramienta" && s.toolInput != null && (
                  <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap break-words text-tiny text-ink-2">{JSON.stringify(s.toolInput, null, 2)}</pre>
                )}
                <p className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-words text-ink-2">{s.content}</p>
              </li>
            ))}
          </ol>
          {learned.length > 0 && <Aprendido nombre={agentName} items={learned} />}
          <p className="text-tiny text-ink-3">
            Total: {view.task.steps} {view.task.steps === 1 ? "paso" : "pasos"} · {tokens(view.task.usage.inputTokens)} entrada ·{" "}
            {tokens(view.task.usage.outputTokens)} salida · {tokens(view.task.usage.cacheReadTokens)} caché leída ·{" "}
            {tokens(view.task.usage.cacheWriteTokens)} caché escrita · <strong>{eur(view.task.costEur)} €</strong>
          </p>
        </div>
      )}
    </div>
  );
}
