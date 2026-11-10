/** Geometría compartida de las líneas de traspaso (oficina y web pública). Sin dependencias. */
export type Rect = { x: number; y: number; w: number; h: number };

/** Curva suave entre dos tarjetas: en la misma fila sale por arriba en arco; en filas distintas, en «S». */
export function curve(a: Rect, b: Rect) {
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
