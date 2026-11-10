"use client";

import { useEffect, useState } from "react";
import { historialDeCalidadDeAgente } from "@/app/actions/agentes";

type Historial = { averageSampleScore: number | null; sampleCount: number; positiveRatings: number; negativeRatings: number; certification: "vigente" | "no_vigente" | "suspendida" };
const etiqueta: Record<Historial["certification"], string> = { vigente: "Vigente", no_vigente: "No vigente", suspendida: "Suspendida" };

/** Solo métricas que puede ver la empresa: excluye evidencias, alertas, sanciones y notas internas. */
export function HistorialCalidad({ agentSlug }: { agentSlug: string }) {
  const [data, setData] = useState<Historial | null | undefined>(undefined);
  useEffect(() => { void historialDeCalidadDeAgente(agentSlug).then((r) => setData(r as Historial | null)); }, [agentSlug]);
  if (data === undefined) return <p className="text-small text-ink-3">Cargando historial de calidad…</p>;
  if (!data) return <p className="text-small text-ink-3">El historial de calidad estará disponible cuando el agente tenga actividad real.</p>;
  return <dl className="grid grid-cols-2 gap-2 text-small">
    <div><dt className="text-ink-3">Muestreo</dt><dd className="font-semibold">{data.averageSampleScore === null ? "Aún sin nota" : `${data.averageSampleScore}/10`} <span className="font-normal text-ink-2">({data.sampleCount})</span></dd></div>
    <div><dt className="text-ink-3">Valoraciones</dt><dd className="font-semibold">{data.positiveRatings} positivas · {data.negativeRatings} negativas</dd></div>
    <div className="col-span-2"><dt className="text-ink-3">Certificación</dt><dd className="font-semibold">{etiqueta[data.certification]}</dd></div>
  </dl>;
}
