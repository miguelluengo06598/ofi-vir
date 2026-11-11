"use client";

import { OctagonX, Play } from "lucide-react";
import { useState } from "react";
import { GlassInput, PillButton } from "@/components/glass";

type Estado = { activa: boolean; motivo: string | null; cambiadoEn: string | null; cambiadoPor: string | null; puedeCambiar: boolean };

/** Botón de parada de emergencia global (solo admin_samgple). Lo comprueba el servidor; aquí solo se muestra. */
export function ParadaEmergencia({ inicial }: { inicial: Estado }) {
  const [estado, setEstado] = useState(inicial);
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function cambiar(activar: boolean) {
    setError(null);
    const r = await fetch("/api/admin/parada-emergencia", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(activar ? { activar, motivo } : { activar }) });
    if (!r.ok) return setError("No se pudo cambiar la parada de emergencia.");
    setEstado({ ...(await r.json()), puedeCambiar: true });
    setMotivo("");
  }

  return (
    <div className="flex flex-col gap-4">
      <p className={`text-h2 ${estado.activa ? "text-status-error" : "text-status-working"}`} role="status">
        {estado.activa ? "Parada de emergencia ACTIVA: ningún agente trabaja" : "Los agentes funcionan con normalidad"}
      </p>
      {estado.activa && <p className="text-small text-ink-2">Motivo: {estado.motivo ?? "—"} · {estado.cambiadoPor ?? "—"}{estado.cambiadoEn ? `, ${new Date(estado.cambiadoEn).toLocaleString("es-ES")}` : ""}</p>}
      {!estado.puedeCambiar ? <p className="text-small text-ink-3">Solo un administrador de MyOfia puede activarla o desactivarla.</p> : estado.activa ? (
        <div><PillButton icon={Play} onClick={() => void cambiar(false)}>Desactivar la parada</PillButton></div>
      ) : (
        <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); if (motivo.trim().length >= 3) void cambiar(true); }}>
          <GlassInput aria-label="Motivo de la parada" placeholder="Motivo (obligatorio)" value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={300} />
          <div><PillButton type="submit" icon={OctagonX} solid disabled={motivo.trim().length < 3} className="bg-status-error/60!">Parada de emergencia</PillButton></div>
        </form>
      )}
      {error && <p role="alert" className="text-small text-status-error">{error}</p>}
    </div>
  );
}
