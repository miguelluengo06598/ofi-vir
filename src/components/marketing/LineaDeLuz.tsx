"use client";

import { animate } from "framer-motion";
import { useEffect, useId, useRef, useState, type RefObject } from "react";
import { curve, type Rect } from "@/components/handoffs/curva";
import { LUZ } from "./tipografia";
import { usePreferencias } from "./preferencias";

type Props = {
  /** Contenedor posicionado (relative) en el que se dibuja la línea. */
  contenedor: RefObject<HTMLElement | null>;
  desde: RefObject<HTMLElement | null>;
  hasta: RefObject<HTMLElement | null>;
  /** Cambia de valor para lanzar una partícula (p. ej. el número de traspaso). */
  disparo?: number;
  /** Si se indica, lanza una partícula cada `cadaMs` mientras el componente está montado. */
  cadaMs?: number;
  colorDesde?: string;
  colorHasta?: string;
  duracion?: number;
  /** Se llama cuando la partícula llega (para encender el destino). */
  alLlegar?: () => void;
};

/**
 * Línea curva entre dos elementos y una partícula de luz que la recorre. Usa la misma curva que la oficina
 * (`curve` de HandoffLayer): arco si están en la misma fila, «S» si están en filas distintas.
 * SVG sin cristal; la partícula solo cambia transform y opacity. Con movimiento reducido: solo la línea, y
 * `alLlegar` se llama al instante.
 */
export function LineaDeLuz({ contenedor, desde, hasta, disparo = 0, cadaMs, colorDesde = "#4F8CFF", colorHasta = LUZ, duracion = 1.4, alLlegar }: Props) {
  const { reducido } = usePreferencias();
  const [rects, setRects] = useState<{ a: Rect; b: Rect } | null>(null);
  const [vuelta, setVuelta] = useState(0);
  const camino = useRef<SVGPathElement>(null);
  const particula = useRef<SVGGElement>(null);
  const llegar = useRef(alLlegar);
  const uid = useId().replace(/:/g, "");

  useEffect(() => {
    llegar.current = alLlegar;
  }, [alLlegar]);

  // Mide los dos elementos respecto al contenedor y vuelve a medir si algo cambia de tamaño.
  useEffect(() => {
    const c = contenedor.current;
    const a = desde.current;
    const b = hasta.current;
    if (!c || !a || !b) return;
    const medir = () => {
      const o = c.getBoundingClientRect();
      const r = (el: HTMLElement) => {
        const x = el.getBoundingClientRect();
        return { x: x.left - o.left, y: x.top - o.top, w: x.width, h: x.height };
      };
      setRects({ a: r(a), b: r(b) });
    };
    medir();
    const obs = new ResizeObserver(medir);
    [c, a, b].forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [contenedor, desde, hasta]);

  useEffect(() => {
    if (!cadaMs) return;
    const t = setInterval(() => setVuelta((v) => v + 1), cadaMs);
    return () => clearInterval(t);
  }, [cadaMs]);

  const lanzamiento = disparo + vuelta;

  useEffect(() => {
    if (lanzamiento === 0) return;
    if (reducido) {
      llegar.current?.();
      return;
    }
    const path = camino.current;
    const dot = particula.current;
    if (!path || !dot) return;
    const largo = path.getTotalLength();
    const control = animate(0, 1, {
      duration: duracion,
      ease: "easeInOut",
      onUpdate: (t) => {
        const p = path.getPointAtLength(t * largo);
        dot.setAttribute("transform", `translate(${p.x} ${p.y})`);
        dot.setAttribute("opacity", String(Math.min(1, t * 8, (1 - t) * 8)));
      },
      onComplete: () => {
        dot.setAttribute("opacity", "0");
        llegar.current?.();
      },
    });
    return () => control.stop();
  }, [lanzamiento, reducido, duracion]);

  if (!rects) return null;
  const c = curve(rects.a, rects.b);

  return (
    <svg aria-hidden="true" className="pointer-events-none absolute inset-0 size-full overflow-visible">
      <defs>
        <linearGradient id={`${uid}-g`} gradientUnits="userSpaceOnUse" x1={c.x1} y1={c.y1} x2={c.x2} y2={c.y2}>
          <stop offset="0" stopColor={colorDesde} />
          <stop offset="1" stopColor={colorHasta} />
        </linearGradient>
        <radialGradient id={`${uid}-r`}>
          <stop offset="0" stopColor={LUZ} stopOpacity="0.95" />
          <stop offset="1" stopColor={LUZ} stopOpacity="0" />
        </radialGradient>
      </defs>
      <path ref={camino} d={c.d} fill="none" stroke={`url(#${uid}-g)`} strokeWidth="1.5" strokeLinecap="round" opacity="0.45" />
      {!reducido && (
        <g ref={particula} opacity="0">
          <circle r="16" fill={`url(#${uid}-r)`} />
          <circle r="4.5" fill="#fff" />
        </g>
      )}
    </svg>
  );
}
