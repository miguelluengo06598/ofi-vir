"use client";

import { ThumbsDown, ThumbsUp } from "lucide-react";
import { useState } from "react";
import { valorarAprobacionDeAgente } from "@/app/actions/agentes";
import { PillButton } from "@/components/glass";

/** Valoración breve, asociada al acto concreto y no a una impresión genérica del agente. */
export function ValoracionAgente({ approvalId }: { approvalId: string }) {
  const [valor, setValor] = useState<1 | -1 | null>(null);
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState("");
  const guardar = async (v: 1 | -1) => {
    setError("");
    const r = await valorarAprobacionDeAgente({ approvalId, valor: v, ...(motivo.trim() ? { motivo: motivo.trim() } : {}) });
    if (r.ok) setValor(v); else setError(r.mensaje);
  };
  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-glass-border pt-3 text-small" aria-label="Valorar acción del agente">
      <span className="text-ink-2">¿Cómo valoras esta acción?</span>
      <PillButton icon={ThumbsUp} active={valor === 1} aria-pressed={valor === 1} onClick={() => void guardar(1)}>Bien</PillButton>
      <PillButton icon={ThumbsDown} active={valor === -1} aria-pressed={valor === -1} onClick={() => void guardar(-1)}>Mal</PillButton>
      {valor === -1 && <input aria-label="Motivo de la valoración negativa (opcional)" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Motivo opcional" maxLength={1000} className="min-w-44 flex-1 rounded-pill border border-glass-border bg-black/20 px-3 py-2 text-small outline-none" />}
      {error && <span role="alert" className="text-status-error">{error}</span>}
    </div>
  );
}
