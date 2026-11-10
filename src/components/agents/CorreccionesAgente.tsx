"use client";

import { Loader2, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { correccionesDeAgente, retirarCorreccionDeAgente } from "@/app/actions/ciclo";
import type { CorreccionVista } from "@/lib/agentes/correcciones/servicio";

/** Reglas que el agente ha aprendido de las correcciones del equipo: activas (ya en sus instrucciones) y pendientes del examen técnico. */
export function CorreccionesAgente({ agentSlug, agentName }: { agentSlug: string; agentName: string }) {
  const [datos, setDatos] = useState<{ correcciones: CorreccionVista[]; maximo: number } | null | undefined>(undefined);
  const [ocupada, setOcupada] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try { setDatos(await correccionesDeAgente(agentSlug)); } catch { setDatos(null); }
  }, [agentSlug]);
  useEffect(() => {
    const t = setTimeout(cargar, 0);
    return () => clearTimeout(t);
  }, [cargar]);

  const retirar = async (c: CorreccionVista) => {
    setOcupada(c.id); setAviso(null);
    try {
      const r = await retirarCorreccionDeAgente({ agentSlug, correccionId: c.id });
      setAviso(!r.ok ? r.mensaje : r.certificacion?.enviada ? "Retirar una regla es un cambio importante: se ha enviado a certificación y seguirá aplicándose hasta que se apruebe." : "Regla retirada.");
    } catch {
      setAviso("No se pudo contactar con el servidor.");
    } finally {
      setOcupada(null);
      await cargar();
    }
  };

  if (datos === undefined) return <p className="text-small text-ink-3">Cargando…</p>;
  if (datos === null) return <p className="text-small text-ink-3">Las correcciones solo están disponibles con el backend real.</p>;
  return (
    <div className="flex flex-col gap-2 text-small">
      {datos.correcciones.length === 0 ? (
        <p className="text-ink-2">Cuando edites una respuesta de {agentName} en Aprobaciones podrás pedirle que lo recuerde para la próxima.</p>
      ) : (
        <ul aria-label={`Reglas aprendidas por ${agentName}`} className="flex flex-col gap-1">
          {datos.correcciones.map((c) => (
            <li key={c.id} className="flex items-start gap-2 rounded-card bg-white/6 px-3 py-2">
              <span className="min-w-0 flex-1">
                <span className="break-words">{c.regla}</span>
                <span className="block text-tiny text-ink-3">{c.estado === "activa" ? "Activa" : "Pendiente del examen técnico"}</span>
              </span>
              <button type="button" aria-label={`Retirar la regla «${c.regla}»`} disabled={ocupada !== null} onClick={() => retirar(c)}
                className="shrink-0 cursor-pointer rounded-pill p-1.5 hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-white disabled:cursor-not-allowed disabled:opacity-50">
                {ocupada === c.id ? <Loader2 size={14} aria-hidden="true" className="animate-spin" /> : <Trash2 size={14} aria-hidden="true" />}
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="text-tiny text-ink-3">{datos.correcciones.length} de {datos.maximo} reglas.</p>
      {aviso && <p role="status" className="text-ink-2">{aviso}</p>}
    </div>
  );
}
