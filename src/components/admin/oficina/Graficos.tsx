"use client";

import { useRef, useState, type ReactNode } from "react";
import { GlassPanel } from "@/components/glass";
import type { Series } from "@/lib/admin/oficina/panorama";

/**
 * Gráficos de la vista ampliada, en SVG y sin librerías. Paleta validada sobre la superficie oscura del
 * cristal (dataviz: banda de luminosidad, croma, daltonismo y contraste): azul = ventas / ingresos,
 * ámbar = consumo / coste. Un solo eje por gráfico (todo en euros salvo las altas), leyenda siempre que
 * hay dos series, información al pasar el ratón y la misma tabla en «Ver como tabla».
 */
const A = "#3E7FE6";
const B = "#B87C12";
const ANCHO = 600;
const ALTO = 200;
const M = { arriba: 12, derecha: 12, abajo: 26, izquierda: 52 };

const eur = (centimos: number) => `${Math.round(centimos / 100).toLocaleString("es-ES", { useGrouping: "always" } as Intl.NumberFormatOptions)} €`;
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const etiquetaMes = (s: string) => MESES[Number(s.slice(5, 7)) - 1] ?? s;
const etiquetaSemana = (s: string) => `${Number(s.slice(8, 10))} ${MESES[Number(s.slice(5, 7)) - 1]}`;

/** Máximo «redondo» para el eje y sus marcas. */
function escala(max: number) {
  if (max <= 0) return { tope: 1, marcas: [0, 1] };
  const potencia = 10 ** Math.floor(Math.log10(max));
  const paso = [1, 2, 2.5, 5, 10].map((f) => f * potencia).find((p) => max / p <= 4) ?? potencia * 10;
  const tope = Math.ceil(max / paso) * paso;
  return { tope, marcas: Array.from({ length: Math.round(tope / paso) + 1 }, (_, i) => i * paso) };
}

type Serie = { nombre: string; color: string; valores: number[] };

function Leyenda({ series }: { series: Serie[] }) {
  if (series.length < 2) return null;
  return (
    <ul className="flex flex-wrap gap-4 text-tiny text-ink-2">
      {series.map((s) => (
        <li key={s.nombre} className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="h-2 w-4 rounded-full" style={{ background: s.color }} /> {s.nombre}
        </li>
      ))}
    </ul>
  );
}

function Tabla({ etiquetas, series, formato }: { etiquetas: string[]; series: Serie[]; formato: (n: number) => string }) {
  return (
    <details className="mt-2 text-tiny">
      <summary className="cursor-pointer text-ink-2">Ver como tabla</summary>
      <div className="mt-2 max-h-56 overflow-auto rounded-card ring-1 ring-white/10">
        <table className="w-full text-left">
          <thead className="bg-white/5 text-ink-2">
            <tr><th scope="col" className="px-2 py-1">Periodo</th>{series.map((s) => <th key={s.nombre} scope="col" className="px-2 py-1 text-right">{s.nombre}</th>)}</tr>
          </thead>
          <tbody>
            {etiquetas.map((e, i) => (
              <tr key={e} className="border-t border-white/10">
                <th scope="row" className="px-2 py-1 font-normal">{e}</th>
                {series.map((s) => <td key={s.nombre} className="px-2 py-1 text-right tabular-nums">{formato(s.valores[i])}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

/** Lienzo común: ejes, rejilla, zona de hover por columna y la caja de información. */
function Lienzo({ titulo, etiquetas, series, formato, children }: {
  titulo: string; etiquetas: string[]; series: Serie[]; formato: (n: number) => string;
  children: (geo: { x: (i: number) => number; y: (v: number) => number; banda: number; base: number }) => ReactNode;
}) {
  const caja = useRef<HTMLDivElement>(null);
  const [foco, setFoco] = useState<number | null>(null);
  const max = Math.max(0, ...series.flatMap((s) => s.valores));
  const { tope, marcas } = escala(max);
  const n = etiquetas.length;
  const banda = (ANCHO - M.izquierda - M.derecha) / n;
  const x = (i: number) => M.izquierda + banda * i + banda / 2;
  const base = ALTO - M.abajo;
  const y = (v: number) => base - (v / tope) * (base - M.arriba);
  const cada = Math.ceil(n / 6);

  return (
    <figure className="flex flex-col gap-2">
      <figcaption className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-small font-semibold">{titulo}</span>
        <Leyenda series={series} />
      </figcaption>
      <div ref={caja} className="relative" onMouseLeave={() => setFoco(null)}>
        <svg viewBox={`0 0 ${ANCHO} ${ALTO}`} className="w-full" role="img" aria-label={`${titulo}. Los datos están en «Ver como tabla».`}>
          {marcas.map((m) => (
            <g key={m}>
              <line x1={M.izquierda} x2={ANCHO - M.derecha} y1={y(m)} y2={y(m)} stroke="rgba(255,255,255,0.10)" strokeWidth={1} />
              <text x={M.izquierda - 8} y={y(m) + 4} textAnchor="end" fontSize={11} fill="rgba(255,255,255,0.62)">{formato(m)}</text>
            </g>
          ))}
          {etiquetas.map((e, i) => (i % cada === 0 || i === n - 1) && (
            <text key={e} x={x(i)} y={ALTO - 8} textAnchor="middle" fontSize={11} fill="rgba(255,255,255,0.62)">{e}</text>
          ))}
          {foco !== null && <line x1={x(foco)} x2={x(foco)} y1={M.arriba} y2={base} stroke="rgba(255,255,255,0.35)" strokeWidth={1} />}
          {children({ x, y, banda, base })}
          {/* Zonas de hover: la columna entera, más grande que la marca. */}
          {etiquetas.map((e, i) => (
            <rect key={e} x={M.izquierda + banda * i} y={M.arriba} width={banda} height={base - M.arriba} fill="transparent" onMouseEnter={() => setFoco(i)} />
          ))}
        </svg>
        {foco !== null && (
          <div
            className="pointer-events-none absolute top-0 z-10 rounded-card bg-black/85 px-3 py-2 text-tiny shadow-lg ring-1 ring-white/15"
            style={{ left: `${(x(foco) / ANCHO) * 100}%`, transform: `translateX(${foco > n / 2 ? "calc(-100% - 8px)" : "8px"})` }}
          >
            <p className="font-semibold">{etiquetas[foco]}</p>
            {series.map((s) => (
              <p key={s.nombre} className="mt-0.5 flex items-center gap-1.5 text-ink-2">
                <span aria-hidden="true" className="size-2 rounded-full" style={{ background: s.color }} />
                {s.nombre}: <span className="text-white tabular-nums">{formato(s.valores[foco])}</span>
              </p>
            ))}
          </div>
        )}
      </div>
      <Tabla etiquetas={etiquetas} series={series} formato={formato} />
    </figure>
  );
}

function Lineas({ titulo, etiquetas, series, formato }: { titulo: string; etiquetas: string[]; series: Serie[]; formato: (n: number) => string }) {
  return (
    <Lienzo titulo={titulo} etiquetas={etiquetas} series={series} formato={formato}>
      {({ x, y }) =>
        series.map((s) => {
          const d = s.valores.map((v, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(v)}`).join(" ");
          const ultimo = s.valores.length - 1;
          return (
            <g key={s.nombre}>
              <path d={d} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
              <circle cx={x(ultimo)} cy={y(s.valores[ultimo])} r={4} fill={s.color} stroke="#1E1D24" strokeWidth={2} />
            </g>
          );
        })
      }
    </Lienzo>
  );
}

/** Barras (una o varias series por columna). Grosor máximo 24 px, 2 px de aire entre barras, extremo redondeado. */
function Barras({ titulo, etiquetas, series, formato }: { titulo: string; etiquetas: string[]; series: Serie[]; formato: (n: number) => string }) {
  return (
    <Lienzo titulo={titulo} etiquetas={etiquetas} series={series} formato={formato}>
      {({ x, y, banda, base }) => {
        const grosor = Math.min(24, (banda * 0.7 - 2 * (series.length - 1)) / series.length);
        const total = grosor * series.length + 2 * (series.length - 1);
        return etiquetas.map((e, i) =>
          series.map((s, k) => {
            const v = s.valores[i];
            const alto = Math.max(0, base - y(v));
            const izq = x(i) - total / 2 + k * (grosor + 2);
            const r = Math.min(4, alto, grosor / 2);
            // Redondeado arriba (el extremo del dato) y recto en la base.
            const path = alto <= 0 ? "" : `M${izq},${base} V${base - alto + r} Q${izq},${base - alto} ${izq + r},${base - alto} H${izq + grosor - r} Q${izq + grosor},${base - alto} ${izq + grosor},${base - alto + r} V${base} Z`;
            return path ? <path key={`${e}-${s.nombre}`} d={path} fill={s.color} /> : null;
          }),
        );
      }}
    </Lienzo>
  );
}

export function GraficosPanorama({ series }: { series: Series }) {
  const semanas = series.semanas ?? [];
  const meses = series.meses ?? [];
  const ultimos6 = meses.slice(-6);
  return (
    <GlassPanel className="grid gap-8 p-5 sm:p-6 lg:grid-cols-2 [--glass-fill:rgba(16,16,22,0.55)]">
      <div className="lg:col-span-2">
        <Lineas
          titulo="Ventas y consumo por semana"
          etiquetas={semanas.map((s) => etiquetaSemana(s.inicio))}
          formato={eur}
          series={[
            { nombre: "Ventas (sin IVA)", color: A, valores: semanas.map((s) => s.ventas_centimos) },
            // 1 crédito = 1 céntimo: el consumo se expresa en euros para compartir eje con las ventas.
            { nombre: "Consumo (créditos en €)", color: B, valores: semanas.map((s) => s.creditos_consumidos) },
          ]}
        />
      </div>
      <Barras
        titulo="Nuevas empresas por mes"
        etiquetas={meses.map((m) => etiquetaMes(m.inicio))}
        formato={(n) => n.toLocaleString("es-ES")}
        series={[{ nombre: "Nuevas empresas", color: A, valores: meses.map((m) => m.nuevas_empresas) }]}
      />
      <Barras
        titulo="Coste de IA frente a ingresos"
        etiquetas={ultimos6.map((m) => etiquetaMes(m.inicio))}
        formato={eur}
        series={[
          { nombre: "Ingresos (sin IVA)", color: A, valores: ultimos6.map((m) => m.ingresos_centimos) },
          { nombre: "Coste de IA", color: B, valores: ultimos6.map((m) => m.coste_ia_centimos) },
        ]}
      />
    </GlassPanel>
  );
}
