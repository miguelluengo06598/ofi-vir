"use client";

import { AnimatePresence, animate, motion, useReducedMotion } from "framer-motion";
import { useEffect, useId, useRef, useState, type RefObject } from "react";
import { GlassPanel, departmentColor, type DepartmentId } from "@/components/glass";
import { useSimulation } from "@/components/SimulationProvider";
import { connectedPairs } from "@/data/handoffs";
import { useMediaQuery } from "@/lib/useMediaQuery";

type Rect = { x: number; y: number; w: number; h: number };
type Rects = Partial<Record<DepartmentId, Rect>>;

/** Duración del viaje de la partícula (s); el brillo y la burbuja de destino esperan a que llegue. */
const TRAVEL = 1.4;
const BUBBLE_MS = 4500;

/** Curva suave entre dos tarjetas: en la misma fila sale por arriba en arco; en filas distintas, en «S». */
function curve(a: Rect, b: Rect) {
  const x1 = a.x + a.w / 2;
  const x2 = b.x + b.w / 2;
  if (Math.abs(a.y - b.y) < 40) {
    const lift = Math.min(130, Math.max(44, Math.abs(x2 - x1) * 0.25));
    return { d: `M${x1},${a.y} C${x1},${a.y - lift} ${x2},${b.y - lift} ${x2},${b.y}`, x1, y1: a.y, x2, y2: b.y };
  }
  const down = b.y > a.y;
  const y1 = down ? a.y + a.h : a.y;
  const y2 = down ? b.y : b.y + b.h;
  const mid = (y1 + y2) / 2;
  return { d: `M${x1},${y1} C${x1},${mid} ${x2},${mid} ${x2},${y2}`, x1, y1, x2, y2 };
}

/**
 * Líneas y partículas de los traspasos, detrás de las tarjetas de departamento.
 * No es cristal: SVG ligero que solo anima transform y opacity.
 */
export function HandoffLayer({ containerRef, layoutKey }: { containerRef: RefObject<HTMLElement | null>; layoutKey: string }) {
  const wide = useMediaQuery("(min-width: 1024px)");
  const reduced = useReducedMotion();
  const { latest } = useSimulation();
  const [rects, setRects] = useState<Rects>({});
  const [bubbles, setBubbles] = useState<{ seq: number; dept: DepartmentId; text: string }[]>([]);
  const uid = useId().replace(/:/g, "");
  const particle = useRef<SVGGElement>(null);
  const activePath = useRef<SVGPathElement>(null);

  // Mide las tarjetas reales y recalcula al cambiar el tamaño de la ventana o de las tarjetas.
  useEffect(() => {
    const container = containerRef.current;
    if (!wide || !container) return;
    const measure = () => {
      const origin = container.getBoundingClientRect();
      const next: Rects = {};
      container.querySelectorAll<HTMLElement>("[data-card]").forEach((el) => {
        const r = el.getBoundingClientRect();
        next[el.dataset.card as DepartmentId] = { x: r.left - origin.left, y: r.top - origin.top, w: r.width, h: r.height };
      });
      setRects(next);
    };
    measure();
    // Las tarjetas entran con una animación: se vuelve a medir cuando han terminado de colocarse.
    const settle = setTimeout(measure, 1200);
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    container.querySelectorAll("[data-card]").forEach((el) => observer.observe(el));
    window.addEventListener("resize", measure);
    return () => {
      clearTimeout(settle);
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [wide, containerRef, layoutKey]);

  const handoff = latest?.handoff;
  const from = handoff && rects[handoff.fromDepartmentId];
  const to = handoff && rects[handoff.toDepartmentId];
  const travel = from && to && handoff.fromDepartmentId !== handoff.toDepartmentId ? curve(from, to) : null;

  // Partícula de luz: recorre la curva moviendo solo `transform` y `opacity`.
  useEffect(() => {
    const path = activePath.current;
    const dot = particle.current;
    if (!path || !dot) return;
    const length = path.getTotalLength();
    const controls = animate(0, 1, {
      duration: TRAVEL,
      ease: "easeInOut",
      onUpdate: (t) => {
        const p = path.getPointAtLength(t * length);
        dot.setAttribute("transform", `translate(${p.x} ${p.y})`);
        dot.setAttribute("opacity", String(Math.min(1, t * 8, (1 - t) * 8)));
      },
      onComplete: () => dot.setAttribute("opacity", "0"),
    });
    return () => controls.stop();
    // Solo se relanza con un traspaso nuevo, no al recalcular las medidas de las tarjetas.
  }, [latest?.seq, reduced]);

  // Burbuja de cristal en la tarjeta de destino, un momento después de que llegue la partícula.
  useEffect(() => {
    if (!latest || !wide) return;
    const { seq, handoff: h } = latest;
    const show = setTimeout(
      () => setBubbles((b) => [...b.filter((x) => x.dept !== h.toDepartmentId), { seq, dept: h.toDepartmentId, text: h.bubble }]),
      reduced ? 0 : TRAVEL * 1000,
    );
    const hide = setTimeout(() => setBubbles((b) => b.filter((x) => x.seq !== seq)), (reduced ? 0 : TRAVEL * 1000) + BUBBLE_MS);
    return () => {
      clearTimeout(show);
      clearTimeout(hide);
    };
  }, [latest, wide, reduced]);

  if (!wide) return null;

  return (
    <>
      <svg aria-hidden="true" className="pointer-events-none absolute inset-0 size-full overflow-visible">
        <defs>
          {connectedPairs().map(([a, b], i) => {
            const ra = rects[a];
            const rb = rects[b];
            if (!ra || !rb) return null;
            const c = curve(ra, rb);
            return (
              <linearGradient key={i} id={`${uid}-p${i}`} gradientUnits="userSpaceOnUse" x1={c.x1} y1={c.y1} x2={c.x2} y2={c.y2}>
                <stop offset="0" stopColor={departmentColor[a]} />
                <stop offset="1" stopColor={departmentColor[b]} />
              </linearGradient>
            );
          })}
          {travel && handoff && (
            <linearGradient id={`${uid}-active`} gradientUnits="userSpaceOnUse" x1={travel.x1} y1={travel.y1} x2={travel.x2} y2={travel.y2}>
              <stop offset="0" stopColor={departmentColor[handoff.fromDepartmentId]} />
              <stop offset="1" stopColor={departmentColor[handoff.toDepartmentId]} />
            </linearGradient>
          )}
          <radialGradient id={`${uid}-glow`}>
            <stop offset="0" stopColor="#fff" stopOpacity="0.9" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* En reposo: una línea muy tenue por cada pareja de departamentos que se comunican. */}
        {connectedPairs().map(([a, b], i) => {
          const ra = rects[a];
          const rb = rects[b];
          if (!ra || !rb) return null;
          return <path key={i} d={curve(ra, rb).d} fill="none" stroke={`url(#${uid}-p${i})`} strokeWidth="1.5" strokeLinecap="round" opacity="0.16" />;
        })}

        {travel && latest && (
          <g key={latest.seq}>
            {!reduced && (
              <motion.path
                ref={activePath}
                d={travel.d}
                fill="none"
                stroke={`url(#${uid}-active)`}
                strokeWidth="2.5"
                strokeLinecap="round"
                initial={{ opacity: 0 }}
                animate={{ opacity: [0, 0.85, 0.85, 0] }}
                transition={{ duration: TRAVEL + 1, times: [0, 0.15, 0.7, 1] }}
              />
            )}
            {!reduced && (
              <g ref={particle} opacity="0">
                <circle r="14" fill={`url(#${uid}-glow)`} />
                <circle r="4.5" fill="#fff" />
              </g>
            )}
          </g>
        )}
      </svg>

      <div className="pointer-events-none absolute inset-0 z-20">
        <AnimatePresence>
          {bubbles.map((b) => {
            const r = rects[b.dept];
            if (!r) return null;
            return (
              <div
                key={b.seq}
                aria-hidden="true"
                className="absolute"
                style={{ left: r.x + r.w / 2, top: r.y, transform: "translate(-50%, calc(-100% - 10px))" }}
              >
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.25, ease: "easeOut" }}
                >
                  <GlassPanel className="rounded-pill! px-4 py-2 text-small whitespace-nowrap">{b.text}</GlassPanel>
                </motion.div>
              </div>
            );
          })}
        </AnimatePresence>
      </div>
    </>
  );
}
