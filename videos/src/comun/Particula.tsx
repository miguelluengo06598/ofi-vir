import { curve, type Rect } from "@/components/handoffs/curva";
import { LUZ } from "@/components/marketing/tipografia";

/** Punto de una curva cúbica «M x,y C x,y x,y x,y» (la que genera `curve` de la oficina) en t ∈ [0,1]. */
function punto(d: string, t: number) {
  const n = d.match(/-?\d+(\.\d+)?/g)!.map(Number);
  const [x0, y0, x1, y1, x2, y2, x3, y3] = n;
  const u = 1 - t;
  const b = (a: number, b1: number, c: number, e: number) => u * u * u * a + 3 * u * u * t * b1 + 3 * u * t * t * c + t * t * t * e;
  return { x: b(x0, x1, x2, x3), y: b(y0, y1, y2, y3) };
}

/**
 * Línea de luz entre dos tarjetas con la MISMA curva que la oficina y la web (handoffs/curva.ts).
 * `t` (0→1) es el avance de la partícula; `visible` la opacidad de la línea.
 */
export function LineaYParticula({ desde, hasta, t, visible, colorDesde, colorHasta, id }: {
  desde: Rect; hasta: Rect; t: number; visible: number; colorDesde: string; colorHasta: string; id: string;
}) {
  const c = curve(desde, hasta);
  const p = punto(c.d, t);
  const brillo = Math.min(1, t * 8, (1 - t) * 8) * (t > 0 && t < 1 ? 1 : 0);
  return (
    <svg style={{ position: "absolute", inset: 0, overflow: "visible", pointerEvents: "none" }} width="100%" height="100%">
      <defs>
        <linearGradient id={`${id}-g`} gradientUnits="userSpaceOnUse" x1={c.x1} y1={c.y1} x2={c.x2} y2={c.y2}>
          <stop offset="0" stopColor={colorDesde} />
          <stop offset="1" stopColor={colorHasta} />
        </linearGradient>
        <radialGradient id={`${id}-r`}>
          <stop offset="0" stopColor={LUZ} stopOpacity="0.95" />
          <stop offset="1" stopColor={LUZ} stopOpacity="0" />
        </radialGradient>
      </defs>
      <path d={c.d} fill="none" stroke={`url(#${id}-g)`} strokeWidth="2" strokeLinecap="round" opacity={0.16 + 0.6 * visible} />
      <g transform={`translate(${p.x} ${p.y})`} opacity={brillo}>
        <circle r="18" fill={`url(#${id}-r)`} />
        <circle r="4.5" fill="#fff" />
      </g>
    </svg>
  );
}
