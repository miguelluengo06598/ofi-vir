"use client";

import { CalendarClock } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { GlassPanel, PillButton } from "@/components/glass";
import { llamar } from "@/components/oficina/llamar";

type Seguimiento = { id: string; agente: string; fecha: string; motivo: string; mensajePrevisto: string; estado: string };
const FECHA = (iso: string) => new Date(iso).toLocaleString("es-ES", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });

/**
 * Seguimientos que proponen los agentes («escribir al lead en 3 días si no contesta»). Un agente nunca se programa trabajo: solo si
 * una persona lo aprueba aquí se programa la tarea para esa fecha.
 */
export function SeguimientosPropuestos() {
  const [lista, setLista] = useState<Seguimiento[] | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const cargar = useCallback(async () => {
    const r = await llamar<{ seguimientos: Seguimiento[] }>("/api/seguimientos");
    if (r.ok) setLista(r.datos.seguimientos.filter((s) => s.estado === "propuesto"));
  }, []);
  useEffect(() => { void llamar<{ seguimientos: Seguimiento[] }>("/api/seguimientos").then((r) => r.ok && setLista(r.datos.seguimientos.filter((s) => s.estado === "propuesto"))); }, []);

  async function decidir(s: Seguimiento, decision: "aprobar" | "rechazar") {
    const r = await llamar(`/api/seguimientos/${s.id}`, "POST", { decision });
    setMsg(r.ok ? (decision === "aprobar" ? `Seguimiento de ${s.agente} programado para el ${FECHA(s.fecha)}.` : "Seguimiento rechazado: no se hará.") : r.mensaje);
    await cargar();
  }

  if (!lista || lista.length === 0) return msg ? <p role="status" className="text-small text-ink-2">{msg}</p> : null;
  return (
    <section aria-labelledby="seguimientos-titulo" className="flex flex-col gap-3">
      <h2 id="seguimientos-titulo" className="text-h2">Seguimientos propuestos</h2>
      {lista.map((s) => (
        <GlassPanel key={s.id} className="flex flex-col gap-2 rounded-card p-4 text-small">
          <p className="flex items-center gap-2 font-semibold"><CalendarClock size={16} aria-hidden="true" />{s.agente} propone un seguimiento</p>
          <p><span className="text-ink-2">Cuándo:</span> {FECHA(s.fecha)}</p>
          <p><span className="text-ink-2">Por qué:</span> {s.motivo}</p>
          <p className="whitespace-pre-wrap rounded-card bg-black/20 p-3"><span className="text-ink-2">Mensaje previsto:</span> {s.mensajePrevisto}</p>
          <p className="text-tiny text-ink-3">No se programa nada hasta que lo apruebes. Ese día el agente lo revisará con lo que sepa entonces; los correos seguirán necesitando aprobación.</p>
          <div className="flex flex-wrap gap-2">
            <PillButton solid onClick={() => void decidir(s, "aprobar")}>Aprobar y programar</PillButton>
            <PillButton onClick={() => void decidir(s, "rechazar")}>Rechazar</PillButton>
          </div>
        </GlassPanel>
      ))}
      {msg && <p role="status" className="text-small text-ink-2">{msg}</p>}
    </section>
  );
}
