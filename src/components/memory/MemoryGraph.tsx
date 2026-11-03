"use client";

import { Maximize, Minus, Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { PillButton } from "@/components/glass";
import {
  edgeKindLabel,
  nodeTypeLabel,
  type MemoryClient,
  type MemoryEdge,
  type MemoryNode,
  type NodeType,
} from "@/data/memory";
import { LABEL_LINE_H, NODE_RADIUS, clusterLayout, labelLines, packClusters, type Pt } from "@/lib/memoryLayout";
import { nodeColor, shapePath } from "./NodeGlyph";

export type GraphCluster = { client: MemoryClient; nodes: MemoryNode[]; edges: MemoryEdge[] };

type Props = {
  clusters: GraphCluster[];
  /** Nodos ocultos por los filtros (siguen ocupando su sitio para que nada se mueva). */
  hiddenIds: Set<string>;
  selectedId: string | null;
  /** Nodo seleccionado y sus vecinos; null si no hay selección. */
  lit: Set<string> | null;
  matches: Set<string>;
  searching: boolean;
  adjacency: Map<string, Set<string>>;
  onSelect: (id: string | null) => void;
};

type View = { k: number; dx: number; dy: number };
const RESET: View = { k: 1, dx: 0, dy: 0 };
const MIN_K = 0.6;
const MAX_K = 5;
const GLYPH_TYPES = Object.keys(nodeTypeLabel) as NodeType[];

const clamp = (n: number, a: number, b: number) => Math.min(b, Math.max(a, n));

/**
 * Constelación en un único SVG (sin cristal por nodo). Zoom con la rueda o los botones, arrastrar el fondo
 * para moverse. Teclado: un solo punto de tabulación; flechas para pasar de nodo a nodo, Intro para elegir.
 */
export function MemoryGraph({ clusters, hiddenIds, selectedId, lit, matches, searching, adjacency, onSelect }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setView] = useState<View>(RESET);
  const [hoverEdge, setHoverEdge] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null);

  // Tamaño del contenedor: el viewBox se ajusta a él, así 1 unidad del lienzo = 1 px a zoom 1 × ajuste.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize((s) => (Math.abs(s.w - width) < 1 && Math.abs(s.h - height) < 1 ? s : { w: width, h: height }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const W = size.w || 1000;
  const H = size.h || 600;
  const aspect = Math.round((W / H) * 10) / 10;

  const clusterKey = clusters.map((c) => c.client.id).join("|");
  const [prevKey, setPrevKey] = useState(clusterKey);
  if (prevKey !== clusterKey) {
    setPrevKey(clusterKey);
    setView(RESET);
  }

  // Posiciones: cada racimo se calcula una vez (caché) y aquí solo se colocan en el lienzo.
  const { pos, bounds, titles } = useMemo(() => {
    const layouts = clusters.map((c) => clusterLayout(c.client.id, c.nodes, c.edges));
    const packed = packClusters(
      clusters.map((c, i) => ({ id: c.client.id, hw: layouts[i].hw, hh: layouts[i].hh })),
      aspect,
    );
    const pos = new Map<string, Pt>();
    const titles: { id: string; text: string; cx: number; cy: number; rx: number; ry: number }[] = [];
    clusters.forEach((c, i) => {
      const ctr = packed.centers[c.client.id];
      for (const [id, p] of Object.entries(layouts[i].positions)) pos.set(id, { x: ctr.x + p.x, y: ctr.y + p.y });
      titles.push({ id: c.client.id, text: `${c.client.name} · ${c.client.company}`, cx: ctr.x, cy: ctr.y, rx: layouts[i].hw + 20, ry: layouts[i].hh + 20 });
    });
    return { pos, bounds: packed.bounds, titles };
  }, [clusters, aspect]);

  const [bx, by, bw, bh] = bounds;
  const bcx = bx + bw / 2;
  const bcy = by + bh / 2;
  const fit = Math.min(W / bw, H / bh);
  const s = fit * view.k;
  const cx = bcx + view.dx;
  const cy = bcy + view.dy;
  const viewBox = `${cx - W / (2 * s)} ${cy - H / (2 * s)} ${W / s} ${H / s}`;

  // Referencia al estado actual para los manejadores nativos (la rueda no puede ser pasiva).
  const live = useRef({ s, cx, cy, W, H, fit, k: view.k, bcx, bcy });
  useEffect(() => {
    live.current = { s, cx, cy, W, H, fit, k: view.k, bcx, bcy };
  });

  const zoomAt = useCallback((px: number, py: number, factor: number) => {
    const L = live.current;
    const k = clamp(L.k * factor, MIN_K, MAX_K);
    const s2 = L.fit * k;
    const wx = L.cx + (px - L.W / 2) / L.s;
    const wy = L.cy + (py - L.H / 2) / L.s;
    setView({ k, dx: wx - (px - L.W / 2) / s2 - L.bcx, dy: wy - (py - L.H / 2) / s2 - L.bcy });
  }, []);

  useEffect(() => {
    const el = svg.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomAt]);

  const zoomCenter = (factor: number) => zoomAt(live.current.W / 2, live.current.H / 2, factor);

  const onPanStart = (e: PointerEvent) => {
    drag.current = { x: e.clientX, y: e.clientY, moved: false };
    svg.current?.setPointerCapture(e.pointerId);
  };
  const onPanMove = (e: PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
    d.x = e.clientX;
    d.y = e.clientY;
    const L = live.current;
    setView((v) => ({ ...v, dx: v.dx - dx / L.s, dy: v.dy - dy / L.s }));
  };
  const onPanEnd = (e: PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (svg.current?.hasPointerCapture(e.pointerId)) svg.current.releasePointerCapture(e.pointerId);
    if (d && !d.moved) onSelect(null);
  };

  // Nodos visibles y foco con tabulación única.
  const visible = useMemo(
    () => clusters.flatMap((c) => c.nodes).filter((n) => !hiddenIds.has(n.id)),
    [clusters, hiddenIds],
  );
  const visibleIds = useMemo(() => new Set(visible.map((n) => n.id)), [visible]);
  const activeFocus =
    focusId && visibleIds.has(focusId) ? focusId : selectedId && visibleIds.has(selectedId) ? selectedId : (visible[0]?.id ?? null);

  const edges = useMemo(
    () => clusters.flatMap((c) => c.edges).filter((e) => visibleIds.has(e.from) && visibleIds.has(e.to)),
    [clusters, visibleIds],
  );

  const focusNode = (id: string) => {
    setFocusId(id);
    svg.current?.querySelector<SVGGElement>(`[data-node="${CSS.escape(id)}"]`)?.focus({ preventScroll: true });
  };

  /** Si el nodo enfocado queda fuera de la vista, la centra en él. */
  const reveal = (id: string) => {
    const p = pos.get(id);
    if (!p) return;
    const L = live.current;
    const sx = (p.x - L.cx) * L.s + L.W / 2;
    const sy = (p.y - L.cy) * L.s + L.H / 2;
    const m = 60;
    if (sx < m || sx > L.W - m || sy < m || sy > L.H - m) setView((v) => ({ ...v, dx: p.x - L.bcx, dy: p.y - L.bcy }));
  };

  const onNodeKey = (e: KeyboardEvent, id: string) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelect(id);
      return;
    }
    if (e.key === "Escape") {
      onSelect(null);
      return;
    }
    const dir: Record<string, [number, number]> = {
      ArrowRight: [1, 0],
      ArrowLeft: [-1, 0],
      ArrowDown: [0, 1],
      ArrowUp: [0, -1],
    };
    const d = dir[e.key];
    if (!d) return;
    e.preventDefault();
    const from = pos.get(id)!;
    let best: { id: string; score: number } | null = null;
    for (const n of visible) {
      if (n.id === id) continue;
      const p = pos.get(n.id)!;
      const vx = p.x - from.x;
      const vy = p.y - from.y;
      const ahead = vx * d[0] + vy * d[1];
      if (ahead <= 0) continue;
      const side = Math.abs(vx * d[1] - vy * d[0]);
      const score = ahead + side * 2;
      if (!best || score < best.score) best = { id: n.id, score };
    }
    if (best) focusNode(best.id);
  };

  const onKeyZoom = (e: KeyboardEvent) => {
    if (e.key === "+" || e.key === "=") zoomCenter(1.3);
    else if (e.key === "-") zoomCenter(1 / 1.3);
    else if (e.key === "0") setView(RESET);
  };

  // Con muchos racimos el ajuste reduce el lienzo: las etiquetas crecen un poco para seguir siendo legibles.
  const labelFont = clamp(11 / s, 12, 16);
  const hovered = hoverEdge ? edges.find((e) => e.id === hoverEdge) : null;

  return (
    <div ref={box} className="relative h-full min-h-[26rem] w-full" onKeyDown={onKeyZoom}>
      <svg
        ref={svg}
        viewBox={viewBox}
        role="group"
        aria-label="Red de conocimiento. Con el teclado: flechas para pasar de un nodo a otro, Intro para abrirlo, Escape para soltarlo; más, menos y cero para el zoom."
        className="absolute inset-0 size-full touch-none select-none"
        onPointerMove={onPanMove}
        onPointerUp={onPanEnd}
        onPointerCancel={onPanEnd}
      >
        <defs>
          {GLYPH_TYPES.map((t) => (
            <radialGradient key={t} id={`mem-glow-${t}`}>
              <stop offset="0" stopColor={nodeColor[t]} stopOpacity="0.5" />
              <stop offset="0.45" stopColor={nodeColor[t]} stopOpacity="0.14" />
              <stop offset="1" stopColor={nodeColor[t]} stopOpacity="0" />
            </radialGradient>
          ))}
          <radialGradient id="mem-cluster">
            <stop offset="0" stopColor="#ffffff" stopOpacity="0.1" />
            <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Fondo que se puede arrastrar; pulsar sin arrastrar quita la selección. */}
        <rect x={cx - 5e4} y={cy - 5e4} width={1e5} height={1e5} fill="transparent" onPointerDown={onPanStart} className="cursor-grab active:cursor-grabbing" />

        {titles.map((t) => (
          <g key={t.id} pointerEvents="none">
            <ellipse cx={t.cx} cy={t.cy} rx={t.rx} ry={t.ry} fill="url(#mem-cluster)" />
            <text
              x={t.cx}
              y={t.cy - t.ry - 6}
              textAnchor="middle"
              fontSize={11}
              letterSpacing="0.08em"
              fill="rgba(255,255,255,0.78)"
              paintOrder="stroke"
              stroke="rgba(0,0,0,0.55)"
              strokeWidth={3}
              strokeLinejoin="round"
              className="uppercase"
            >
              {t.text}
            </text>
          </g>
        ))}

        <g>
          {edges.map((e) => {
            const a = pos.get(e.from)!;
            const b = pos.get(e.to)!;
            const incident = selectedId !== null && (e.from === selectedId || e.to === selectedId);
            const opacity = lit
              ? incident
                ? 0.9
                : 0.06
              : searching
                ? matches.has(e.from) && matches.has(e.to)
                  ? 0.7
                  : 0.1
                : e.id === hoverEdge
                  ? 0.9
                  : 0.3;
            return (
              <g key={e.id}>
                <line
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke="#fff"
                  strokeWidth={incident || e.id === hoverEdge ? 1.6 : 1}
                  className="mem-edge"
                  style={{ opacity }}
                  pointerEvents="none"
                />
                {/* Zona de contacto más ancha: el tipo de conexión sale al pasar el ratón. */}
                <line
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke="transparent"
                  strokeWidth={12}
                  onPointerEnter={() => setHoverEdge(e.id)}
                  onPointerLeave={() => setHoverEdge((h) => (h === e.id ? null : h))}
                />
              </g>
            );
          })}
        </g>

        <g>
          {visible.map((n) => {
            const p = pos.get(n.id)!;
            const r = NODE_RADIUS[n.type];
            const lines = labelLines(n.label);
            const isSel = n.id === selectedId;
            const isMatch = searching && matches.has(n.id);
            const dim = lit ? !lit.has(n.id) : searching ? !isMatch : false;
            const degree = adjacency.get(n.id)?.size ?? 0;
            return (
              <g
                key={n.id}
                data-node={n.id}
                role="button"
                tabIndex={n.id === activeFocus ? 0 : -1}
                aria-pressed={isSel}
                aria-label={`${nodeTypeLabel[n.type].singular}: ${n.label}. ${degree} ${degree === 1 ? "conexión" : "conexiones"}.${isMatch ? " Coincide con la búsqueda." : ""}`}
                transform={`translate(${p.x} ${p.y})`}
                className="mem-node"
                style={{ opacity: dim ? 0.2 : 1 }}
                onClick={() => onSelect(isSel ? null : n.id)}
                onKeyDown={(e) => onNodeKey(e, n.id)}
                onFocus={() => {
                  setFocusId(n.id);
                  reveal(n.id);
                }}
              >
                <circle r={r * 3.2} fill={`url(#mem-glow-${n.type})`} pointerEvents="none" className={isSel ? "mem-pulse" : undefined} />
                <circle r={r + 12} fill="transparent" />
                <path d={shapePath(n.type, r)} fill={nodeColor[n.type]} fillOpacity={0.92} stroke="#fff" strokeOpacity={0.75} strokeWidth={1.2} />
                <circle
                  className="mem-ring"
                  r={r + 9}
                  fill="none"
                  stroke="#fff"
                  strokeWidth={isSel ? 2.5 : 2}
                  strokeDasharray={isMatch && !isSel ? "3 4" : undefined}
                  style={{ opacity: isSel || isMatch ? 1 : undefined }}
                  pointerEvents="none"
                />
                <text
                  textAnchor="middle"
                  fontSize={labelFont}
                  fontWeight={isSel ? 600 : 400}
                  fill="#fff"
                  paintOrder="stroke"
                  stroke="rgba(0,0,0,0.6)"
                  strokeWidth={3.2}
                  strokeLinejoin="round"
                  pointerEvents="none"
                >
                  {lines.map((l, i) => (
                    <tspan key={i} x={0} y={r + 8 + LABEL_LINE_H * (i + 0.75)}>
                      {l}
                    </tspan>
                  ))}
                </text>
              </g>
            );
          })}
        </g>

        {hovered && (
          <EdgeTip
            x={(pos.get(hovered.from)!.x + pos.get(hovered.to)!.x) / 2}
            y={(pos.get(hovered.from)!.y + pos.get(hovered.to)!.y) / 2}
            text={edgeKindLabel[hovered.kind]}
            scale={1 / s}
          />
        )}
      </svg>

      <div className="absolute right-0 bottom-0 flex flex-col gap-2">
        <PillButton icon={Plus} aria-label="Acercar" onClick={() => zoomCenter(1.3)} />
        <PillButton icon={Minus} aria-label="Alejar" onClick={() => zoomCenter(1 / 1.3)} />
        <PillButton icon={Maximize} aria-label="Ajustar a la pantalla" onClick={() => setView(RESET)} />
      </div>
    </div>
  );
}

/** Etiqueta del tipo de conexión sobre la línea; mantiene su tamaño en pantalla aunque se haga zoom. */
function EdgeTip({ x, y, text, scale }: { x: number; y: number; text: string; scale: number }) {
  const w = text.length * 7 + 18;
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`} pointerEvents="none">
      <rect x={-w / 2} y={-12} width={w} height={24} rx={12} fill="rgba(10,12,20,0.88)" stroke="rgba(255,255,255,0.4)" />
      <text textAnchor="middle" y={4} fontSize={12} fill="#fff">
        {text}
      </text>
    </g>
  );
}
