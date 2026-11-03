import type { NodeType } from "@/data/memory";

/** Color de cada tipo de nodo. La forma lo refuerza: nunca se distingue solo por color. */
export const nodeColor: Record<NodeType, string> = {
  contacto: "#7DB2FF",
  empresa: "#B79CFF",
  campana: "#FDE047",
  correo: "#F9A8D4",
  dato: "#6EE7B7",
  tarea: "#FB923C",
  agente: "#E5E7EB",
};

/** Contorno de la forma de cada tipo, centrado en (0, 0) y proporcional al radio. */
export function shapePath(type: NodeType, r: number): string {
  const f = (n: number) => Math.round(n * 100) / 100;
  const poly = (pts: [number, number][]) => `M${pts.map(([x, y]) => `${f(x)} ${f(y)}`).join("L")}Z`;
  switch (type) {
    case "contacto": // círculo
      return `M${-r} 0a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`;
    case "empresa": {
      // cuadrado redondeado
      const s = r * 0.95;
      const c = r * 0.3;
      return `M${f(-s + c)} ${f(-s)}H${f(s - c)}Q${f(s)} ${f(-s)} ${f(s)} ${f(-s + c)}V${f(s - c)}Q${f(s)} ${f(s)} ${f(s - c)} ${f(s)}H${f(-s + c)}Q${f(-s)} ${f(s)} ${f(-s)} ${f(s - c)}V${f(-s + c)}Q${f(-s)} ${f(-s)} ${f(-s + c)} ${f(-s)}Z`;
    }
    case "campana": // rombo
      return poly([[0, -r * 1.25], [r * 1.25, 0], [0, r * 1.25], [-r * 1.25, 0]]);
    case "correo": {
      // sobre: rectángulo apaisado
      const w = r * 1.25;
      const h = r * 0.85;
      return poly([[-w, -h], [w, -h], [w, h], [-w, h]]);
    }
    case "dato": // triángulo
      return poly([[0, -r * 1.2], [r * 1.15, r * 0.85], [-r * 1.15, r * 0.85]]);
    case "tarea": // hexágono
      return poly(Array.from({ length: 6 }, (_, i) => [Math.cos((Math.PI / 3) * i) * r * 1.1, Math.sin((Math.PI / 3) * i) * r * 1.1] as [number, number]));
    case "agente": // estrella de cuatro puntas
      return poly([[0, -r * 1.4], [r * 0.4, -r * 0.4], [r * 1.4, 0], [r * 0.4, r * 0.4], [0, r * 1.4], [-r * 0.4, r * 0.4], [-r * 1.4, 0], [-r * 0.4, -r * 0.4]]);
  }
}

/** Icono pequeño con la forma y el color del tipo (filtros, listas y panel). */
export function NodeGlyph({ type, size = 16 }: { type: NodeType; size?: number }) {
  const r = 6;
  return (
    <svg width={size} height={size} viewBox="-9 -9 18 18" aria-hidden="true" className="shrink-0">
      <path d={shapePath(type, r)} fill={nodeColor[type]} stroke="rgba(255,255,255,0.7)" strokeWidth="1" />
    </svg>
  );
}
