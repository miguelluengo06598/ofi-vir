"use client";

import { Check } from "lucide-react";
import { useState } from "react";
import { GlassPanel } from "@/components/glass";
import { VideoProducto } from "@/components/marketing/VideoProducto";
import type { FuentesDeVideo } from "@/config/videos";
import { pasosCadena } from "@/content/inicio";

/**
 * El vídeo de la cadena en un marco de cristal grande y, al lado, sus pasos resaltados a la vez que el
 * vídeo los enseña (marcas de tiempo de src/config/videos.ts). Mientras el vídeo es el provisional, los
 * pasos avanzan en proporción a su duración. Sin vídeo en marcha (póster), los pasos son una lista normal.
 */
export function CadenaSincronizada({ fuentes }: { fuentes: FuentesDeVideo }) {
  const [paso, setPaso] = useState(-1);
  const n = pasosCadena.length;

  const alTiempo = (t: number, duracion: number) => {
    let i: number;
    if (fuentes.marcas && !fuentes.provisional) i = fuentes.marcas.findLastIndex((m) => t >= m);
    else i = Math.min(n - 1, Math.floor((t / (duracion || fuentes.segundos)) * n));
    setPaso((p) => (p === i ? p : i));
  };

  return (
    <GlassPanel className="grid gap-6 p-4 sm:p-6 lg:grid-cols-[1.55fr_1fr] lg:items-center lg:gap-8">
      <div className="relative">
        <VideoProducto poster={fuentes.posterWebp} webm={fuentes.webm} mp4={fuentes.mp4} ancho={fuentes.ancho} alto={fuentes.alto} descripcion={fuentes.descripcion} alTiempo={alTiempo} />
        {fuentes.provisional && (
          <span className="absolute top-3 left-3 rounded-pill bg-black/55 px-2.5 py-1 text-tiny text-white/85 ring-1 ring-white/20">Vídeo provisional</span>
        )}
      </div>
      <ol className="flex flex-col gap-1.5" aria-label="Pasos de la cadena">
        {pasosCadena.map((p, i) => {
          const actual = i === paso;
          const hecho = paso >= 0 && i < paso;
          return (
            <li
              key={p.texto}
              aria-current={actual ? "step" : undefined}
              className={`flex items-start gap-3 rounded-card px-3 py-2.5 transition-colors duration-300 motion-reduce:transition-none ${actual ? "bg-white/15 ring-1 ring-white/25" : ""}`}
            >
              <span
                aria-hidden="true"
                className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-tiny font-semibold ${actual ? "bg-[#FFD48A] text-black" : hecho ? "bg-status-working/80 text-black" : "bg-white/10"}`}
              >
                {hecho ? <Check size={13} /> : i + 1}
              </span>
              <span>
                <span className="block text-tiny text-ink-2">{p.quien}</span>
                <span className="block text-body font-semibold">{p.texto}</span>
              </span>
            </li>
          );
        })}
      </ol>
    </GlassPanel>
  );
}
