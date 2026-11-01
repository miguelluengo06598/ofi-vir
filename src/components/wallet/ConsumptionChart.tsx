import { GlassPanel } from "@/components/glass";
import { fmtCredits, fmtNumber } from "@/lib/format";
import { dailyConsumption } from "@/data/wallet";

function niceMax(v: number) {
  const step = 100;
  return Math.ceil(v / step) * step;
}

const dayLabel = (i: number, n: number) => (i === n - 1 ? "Hoy" : `Hace ${n - 1 - i} d`);

export function ConsumptionChart() {
  const data = dailyConsumption;
  const total = data.reduce((a, b) => a + b, 0);
  const peak = Math.max(...data);
  const max = niceMax(peak);
  const avg = Math.round(total / data.length);

  return (
    <GlassPanel as="section" aria-labelledby="chart-title" className="flex flex-col gap-4 p-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 id="chart-title" className="text-h2">
            Consumo de los últimos 30 días
          </h2>
          <p className="text-small text-ink-2">
            {fmtCredits(total)} en total · media de {fmtNumber(avg)} al día
          </p>
        </div>
      </div>

      <div
        role="img"
        aria-label={`Gráfico de barras del consumo diario de los últimos 30 días. Total ${fmtCredits(total)}, media ${fmtNumber(avg)} al día, máximo ${fmtNumber(peak)} créditos.`}
        className="flex gap-3"
      >
        <div aria-hidden="true" className="flex h-44 flex-col justify-between text-right text-tiny text-ink-3">
          <span>{fmtNumber(max)}</span>
          <span>{fmtNumber(max / 2)}</span>
          <span>0</span>
        </div>
        <div className="flex-1">
          <div className="relative flex h-44 items-end gap-1 border-b border-glass-border">
            <div aria-hidden="true" className="absolute inset-x-0 top-0 border-t border-dashed border-glass-border" />
            <div aria-hidden="true" className="absolute inset-x-0 top-1/2 border-t border-dashed border-glass-border" />
            {data.map((v, i) => (
              <div key={i} className="group relative flex h-full min-w-0 flex-1 items-end">
                <div
                  className={`w-full rounded-t-sm ${i === data.length - 1 ? "bg-white" : "bg-accent"} transition-opacity group-hover:opacity-80`}
                  style={{ height: `${(v / max) * 100}%` }}
                />
                <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 rounded-pill bg-black/75 px-2 py-1 text-tiny whitespace-nowrap group-hover:block">
                  {dayLabel(i, data.length)} · {fmtNumber(v)}
                </span>
              </div>
            ))}
          </div>
          <div aria-hidden="true" className="mt-2 flex justify-between text-tiny text-ink-3">
            <span>Hace 30 d</span>
            <span>Hace 15 d</span>
            <span>Hoy</span>
          </div>
        </div>
      </div>
    </GlassPanel>
  );
}
