import type { MemoryEdge, MemoryNode, NodeType } from "@/data/memory";

/**
 * Distribución de la red de conocimiento, sin librerías.
 *
 * Se hace en dos niveles para que escale con datos reales:
 *  1. `layoutCluster`: coloca los nodos de UN cliente (un racimo) en coordenadas locales. Es determinista
 *     (sin azar: mismas entradas, mismas posiciones) y se calcula una sola vez por racimo, con caché.
 *  2. `packClusters`: reparte los racimos que se van a mostrar en una rejilla. Es barato, así que mostrar
 *     solo los racimos recientes o los que coinciden con una búsqueda no obliga a recalcular los demás.
 */

export type Pt = { x: number; y: number };

export const NODE_RADIUS: Record<NodeType, number> = {
  contacto: 15,
  empresa: 13,
  campana: 13,
  correo: 11,
  dato: 11,
  tarea: 12,
  agente: 12,
};

export const LABEL_LINE_H = 14;
const CHAR_W = 6.4;
const MAX_LINE_CHARS = 17;

/** Parte la etiqueta en un máximo de dos líneas de ~17 caracteres. */
export function labelLines(label: string): string[] {
  if (label.length <= MAX_LINE_CHARS) return [label];
  const words = label.split(" ");
  const lines: string[] = [""];
  for (const w of words) {
    const cur = lines[lines.length - 1];
    if (cur && (cur + " " + w).length > MAX_LINE_CHARS && lines.length < 2) lines.push(w);
    else lines[lines.length - 1] = cur ? `${cur} ${w}` : w;
  }
  return lines;
}

/** Caja que ocupa un nodo con su etiqueta (la etiqueta va debajo), relativa al centro del nodo. */
function box(node: MemoryNode) {
  const r = NODE_RADIUS[node.type];
  const lines = labelLines(node.label);
  const w = Math.max(r * 2, Math.max(...lines.map((l) => l.length)) * CHAR_W) + 10;
  return { hw: w / 2, top: r + 4, bottom: r + 8 + lines.length * LABEL_LINE_H };
}

/** Número estable 0..1 a partir de un texto (desempata posiciones iniciales sin usar azar). */
function hash01(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return ((h >>> 0) % 10000) / 10000;
}

export type ClusterLayout = {
  /** Posición de cada nodo, relativa al centro del racimo. */
  positions: Record<string, Pt>;
  /** Semianchura y semialtura del racimo (nodos + etiquetas), para empaquetar. */
  hw: number;
  hh: number;
};

const RING = 130;

export function layoutCluster(nodes: MemoryNode[], edges: MemoryEdge[]): ClusterLayout {
  const ids = new Set(nodes.map((n) => n.id));
  const links = edges.filter((e) => ids.has(e.from) && ids.has(e.to));
  const adj = new Map<string, string[]>(nodes.map((n) => [n.id, []]));
  for (const e of links) {
    adj.get(e.from)!.push(e.to);
    adj.get(e.to)!.push(e.from);
  }

  // Centro del racimo: el contacto (o, si no hay, el nodo con más conexiones).
  const hub =
    nodes.find((n) => n.type === "contacto") ??
    [...nodes].sort((a, b) => adj.get(b.id)!.length - adj.get(a.id)!.length)[0];

  // Profundidad por anchura desde el centro.
  const depth = new Map<string, number>([[hub.id, 0]]);
  const parent = new Map<string, string>();
  const queue = [hub.id];
  for (let i = 0; i < queue.length; i++) {
    for (const nb of adj.get(queue[i])!) {
      if (!depth.has(nb)) {
        depth.set(nb, depth.get(queue[i])! + 1);
        parent.set(nb, queue[i]);
        queue.push(nb);
      }
    }
  }
  const maxDepth = Math.max(...depth.values());
  for (const n of nodes) if (!depth.has(n.id)) depth.set(n.id, maxDepth + 1);

  // Posiciones iniciales: anillo 1 repartido en círculo; los demás, cerca de su padre y más lejos del centro.
  const pos = new Map<string, Pt>([[hub.id, { x: 0, y: 0 }]]);
  const ring1 = nodes.filter((n) => depth.get(n.id) === 1);
  const angleOf = new Map<string, number>();
  ring1.forEach((n, i) => angleOf.set(n.id, -Math.PI / 2 + (i / ring1.length) * Math.PI * 2));
  const byDepth = [...nodes].filter((n) => depth.get(n.id)! >= 1).sort((a, b) => depth.get(a.id)! - depth.get(b.id)!);
  for (const n of byDepth) {
    const d = depth.get(n.id)!;
    if (d > 1) {
      // Un agente puede colgar de varios nodos: se coloca en la media de los ángulos de sus vecinos más cercanos al centro.
      const inner = adj.get(n.id)!.filter((id) => depth.get(id)! < d && angleOf.has(id));
      const base = inner.length
        ? Math.atan2(
            inner.reduce((s, id) => s + Math.sin(angleOf.get(id)!), 0),
            inner.reduce((s, id) => s + Math.cos(angleOf.get(id)!), 0),
          )
        : hash01(n.id) * Math.PI * 2;
      angleOf.set(n.id, base + (hash01(n.id) - 0.5) * 0.5);
    }
    const a = angleOf.get(n.id)!;
    const r = RING * (d === 1 ? 1 : 1 + (d - 1) * 0.85);
    pos.set(n.id, { x: Math.cos(a) * r, y: Math.sin(a) * r });
  }

  // Relajación: repulsión entre cajas, muelles en las conexiones y atracción suave al anillo de su profundidad.
  const boxes = new Map(nodes.map((n) => [n.id, box(n)]));
  const list = nodes.filter((n) => n.id !== hub.id);
  const ITER = 260;
  for (let it = 0; it < ITER; it++) {
    const alpha = 1 - it / ITER;
    const force = new Map<string, Pt>(list.map((n) => [n.id, { x: 0, y: 0 }]));
    const add = (id: string, fx: number, fy: number) => {
      const f = force.get(id);
      if (f) {
        f.x += fx;
        f.y += fy;
      }
    };
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i].id;
        const b = nodes[j].id;
        const pa = pos.get(a)!;
        const pb = pos.get(b)!;
        let dx = pa.x - pb.x;
        let dy = pa.y - pb.y;
        let d2 = dx * dx + dy * dy;
        if (d2 < 0.01) {
          dx = hash01(a) - 0.5;
          dy = hash01(b) - 0.5;
          d2 = dx * dx + dy * dy + 0.01;
        }
        const d = Math.sqrt(d2);
        const push = Math.min(9000 / d2, 4);
        add(a, (dx / d) * push, (dy / d) * push);
        add(b, (-dx / d) * push, (-dy / d) * push);
      }
    }
    for (const e of links) {
      const pa = pos.get(e.from)!;
      const pb = pos.get(e.to)!;
      const dx = pb.x - pa.x;
      const dy = pb.y - pa.y;
      const d = Math.hypot(dx, dy) || 1;
      const pull = (d - RING * 0.9) * 0.012;
      add(e.from, (dx / d) * pull, (dy / d) * pull);
      add(e.to, (-dx / d) * pull, (-dy / d) * pull);
    }
    for (const n of list) {
      const p = pos.get(n.id)!;
      const d = depth.get(n.id)!;
      const target = RING * (d === 1 ? 1 : 1 + (d - 1) * 0.85);
      const r = Math.hypot(p.x, p.y) || 1;
      const k = (target - r) * 0.02;
      add(n.id, (p.x / r) * k, (p.y / r) * k);
    }
    for (const n of list) {
      const f = force.get(n.id)!;
      const p = pos.get(n.id)!;
      p.x += f.x * alpha * 3;
      p.y += f.y * alpha * 3;
    }
  }

  // Última pasada: separa las cajas que aún se solapan (empuja por el eje con menos solape).
  for (let pass = 0; pass < 60; pass++) {
    let moved = false;
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const A = nodes[i].id;
        const B = nodes[j].id;
        const pa = pos.get(A)!;
        const pb = pos.get(B)!;
        const ba = boxes.get(A)!;
        const bb = boxes.get(B)!;
        const ox = ba.hw + bb.hw + 6 - Math.abs(pa.x - pb.x);
        // Cajas: de (y - top) a (y + bottom).
        const aTop = pa.y - ba.top;
        const aBot = pa.y + ba.bottom;
        const bTop = pb.y - bb.top;
        const bBot = pb.y + bb.bottom;
        const oy = Math.min(aBot, bBot) - Math.max(aTop, bTop) + 4;
        if (ox <= 0 || oy <= 0) continue;
        moved = true;
        const fixedA = A === hub.id;
        const fixedB = B === hub.id;
        const share = fixedA || fixedB ? 1 : 0.5;
        if (ox < oy) {
          const s = (pa.x < pb.x ? -1 : 1) * ox * share;
          if (!fixedA) pa.x += s;
          if (!fixedB) pb.x -= s;
        } else {
          const s = (pa.y < pb.y ? -1 : 1) * oy * share;
          if (!fixedA) pa.y += s;
          if (!fixedB) pb.y -= s;
        }
      }
    }
    if (!moved) break;
  }

  // Centra el racimo en su caja envolvente.
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const n of nodes) {
    const p = pos.get(n.id)!;
    const b = boxes.get(n.id)!;
    minX = Math.min(minX, p.x - b.hw);
    maxX = Math.max(maxX, p.x + b.hw);
    minY = Math.min(minY, p.y - b.top);
    maxY = Math.max(maxY, p.y + b.bottom);
  }
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const positions: Record<string, Pt> = {};
  for (const n of nodes) {
    const p = pos.get(n.id)!;
    positions[n.id] = { x: Math.round((p.x - cx) * 10) / 10, y: Math.round((p.y - cy) * 10) / 10 };
  }
  return { positions, hw: (maxX - minX) / 2, hh: (maxY - minY) / 2 };
}

const cache = new Map<string, ClusterLayout>();

/** Distribución de un racimo con caché: solo se recalcula si cambian los nodos (no al corregir un texto). */
export function clusterLayout(clientId: string, nodes: MemoryNode[], edges: MemoryEdge[]) {
  const key = `${clientId}|${nodes.map((n) => n.id).join(",")}`;
  let hit = cache.get(key);
  if (!hit) {
    hit = layoutCluster(nodes, edges);
    cache.set(key, hit);
  }
  return hit;
}

export type Packed = {
  /** Centro de cada racimo en el lienzo. */
  centers: Record<string, Pt>;
  /** Caja que contiene todo: [x, y, anchura, altura]. */
  bounds: [number, number, number, number];
};

const GAP = 70;
const PAD = 40;

/** Reparte los racimos en filas, eligiendo las columnas que mejor se ajustan a la proporción del lienzo. */
export function packClusters(items: { id: string; hw: number; hh: number }[], aspect: number): Packed {
  if (items.length === 0) return { centers: {}, bounds: [0, 0, 1, 1] };
  let best: { cols: number; score: number } | null = null;
  const rowsFor = (cols: number) => {
    const rows: (typeof items)[] = [];
    for (let i = 0; i < items.length; i += cols) rows.push(items.slice(i, i + cols));
    return rows;
  };
  const measure = (cols: number) => {
    const rows = rowsFor(cols);
    const widths = rows.map((r) => r.reduce((s, c) => s + c.hw * 2, 0) + (r.length - 1) * GAP);
    const heights = rows.map((r) => Math.max(...r.map((c) => c.hh * 2)));
    return { rows, widths, heights, w: Math.max(...widths), h: heights.reduce((s, v) => s + v, 0) + (rows.length - 1) * GAP };
  };
  for (let cols = 1; cols <= items.length; cols++) {
    const m = measure(cols);
    const score = Math.abs(Math.log(m.w / m.h / aspect));
    if (!best || score < best.score) best = { cols, score };
  }
  const m = measure(best!.cols);
  const centers: Record<string, Pt> = {};
  let y = 0;
  m.rows.forEach((row, ri) => {
    let x = -m.widths[ri] / 2;
    for (const c of row) {
      centers[c.id] = { x: x + c.hw, y: y + m.heights[ri] / 2 };
      x += c.hw * 2 + GAP;
    }
    y += m.heights[ri] + GAP;
  });
  const shiftY = -m.h / 2;
  for (const id in centers) centers[id].y += shiftY;
  return { centers, bounds: [-m.w / 2 - PAD, -m.h / 2 - PAD, m.w + PAD * 2, m.h + PAD * 2] };
}
