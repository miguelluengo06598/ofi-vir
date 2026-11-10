"use client";

import { ArrowDownRight, ArrowUpRight, BarChart3, ChevronDown, Minus } from "lucide-react";
import { useId, useState } from "react";
import { GlassPanel } from "@/components/glass";
import { Contador } from "@/components/marketing/Contador";
import type { Indicador, Series } from "@/lib/admin/oficina/panorama";
import { GraficosPanorama } from "./Graficos";

const pct = (a: number, b: number) => (b === 0 ? null : Math.round(((a - b) / Math.abs(b)) * 100));

/** Variación frente al mes anterior. Verde si es buena noticia, ámbar si no; siempre con flecha y texto. */
function Variacion({ i }: { i: Indicador }) {
  const p = pct(i.actual, i.anterior);
  const referencia = i.flujo ? "vs. mes anterior" : "vs. inicio de mes";
  if (p === null) {
    return <span className="text-tiny text-ink-3">{i.actual === 0 ? "Sin datos" : "Nuevo"} · {referencia}</span>;
  }
  if (p === 0) {
    return <span className="inline-flex items-center gap-1 text-tiny text-ink-2"><Minus size={12} aria-hidden="true" /> Igual · {referencia}</span>;
  }
  const sube = p > 0;
  const buena = sube === i.mejorSiSube;
  const Icono = sube ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={`inline-flex items-center gap-1 text-tiny ${buena ? "text-status-working" : "text-status-waiting"}`}>
      <Icono size={13} aria-hidden="true" />
      {sube ? "+" : ""}{p.toLocaleString("es-ES")} %<span className="text-ink-3"> · {referencia}</span>
    </span>
  );
}

/**
 * Barra de Panorama: los indicadores que el rol de la persona puede ver, con contador animado y su
 * variación. «Vista ampliada» despliega los gráficos (solo para quien ve las cifras económicas).
 */
export function BarraPanorama({ indicadores, series }: { indicadores: Indicador[]; series: Series | null }) {
  const [ampliada, setAmpliada] = useState(false);
  const panel = useId();
  return (
    <section aria-labelledby="panorama-t">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 id="panorama-t" className="text-h2">Panorama</h2>
        {series && (
          <button
            type="button"
            aria-expanded={ampliada}
            aria-controls={panel}
            onClick={() => setAmpliada((a) => !a)}
            className="glass glass-interactive inline-flex items-center gap-2 rounded-pill px-4 py-2 text-small"
          >
            <BarChart3 size={16} aria-hidden="true" /> {ampliada ? "Ocultar gráficos" : "Vista ampliada"}
            <ChevronDown size={14} aria-hidden="true" className={`transition-transform motion-reduce:transition-none ${ampliada ? "rotate-180" : ""}`} />
          </button>
        )}
      </div>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {indicadores.map((i) => (
          <GlassPanel as="li" key={i.id} className="flex flex-col gap-1.5 rounded-card! p-4">
            <span className="text-tiny text-ink-2">{i.etiqueta}</span>
            <span className="text-[26px] leading-none font-semibold">
              {i.formato === "euros" ? (
                <Contador valor={Math.round(i.actual / 100)} sufijo=" €" />
              ) : (
                <Contador valor={i.actual} />
              )}
            </span>
            <Variacion i={i} />
          </GlassPanel>
        ))}
      </ul>
      {series && ampliada && (
        <div id={panel} className="mt-4">
          <GraficosPanorama series={series} />
        </div>
      )}
    </section>
  );
}
