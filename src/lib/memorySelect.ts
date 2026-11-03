import { nodeTypeLabel, type MemoryClient, type MemoryEdge, type MemoryNode } from "@/data/memory";

/**
 * Qué racimos (clientes) se dibujan. Con datos reales la red puede tener cientos de clientes, así que por
 * defecto solo se muestran los más recientes; si hay búsqueda, los que contienen alguna coincidencia.
 * «Ver toda la red» lo salta. Con pocos clientes (≤ `RECENT_CLUSTERS`) se ve todo.
 */
export const RECENT_CLUSTERS = 5;

/** Minúsculas y sin tildes: «Gomez» encuentra «Gómez». */
export const normalize = (s: string) =>
  s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();

/** Texto en el que se busca de un nodo (con su tipo: «correo» encuentra los correos). */
export const searchText = (n: MemoryNode) =>
  normalize([n.label, n.detail, nodeTypeLabel[n.type].singular, ...n.events.map((e) => e.text)].join(" "));

/** Ids de los nodos que contienen todas las palabras de la búsqueda. */
export function matchingNodeIds(nodes: MemoryNode[], query: string): Set<string> {
  const words = normalize(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return new Set();
  return new Set(nodes.filter((n) => words.every((w) => searchText(n).includes(w))).map((n) => n.id));
}

export type ClusterSelection = {
  visible: MemoryClient[];
  /** Racimos que existen pero no se dibujan. */
  hiddenCount: number;
  mode: "all" | "recent" | "search";
};

export function selectClusters(opts: {
  clients: MemoryClient[];
  nodes: MemoryNode[];
  /** Coincidencias de la búsqueda; vacío si no se busca nada. */
  matches: Set<string>;
  searching: boolean;
  showAll: boolean;
  limit?: number;
}): ClusterSelection {
  const { clients, nodes, matches, searching, showAll, limit = RECENT_CLUSTERS } = opts;
  const byRecent = [...clients].sort((a, b) => b.lastActivity.localeCompare(a.lastActivity));
  if (searching) {
    const withMatch = new Set(nodes.filter((n) => matches.has(n.id)).map((n) => n.clientId));
    const visible = byRecent.filter((c) => withMatch.has(c.id));
    return { visible, hiddenCount: clients.length - visible.length, mode: "search" };
  }
  if (showAll || clients.length <= limit) return { visible: byRecent, hiddenCount: 0, mode: "all" };
  return { visible: byRecent.slice(0, limit), hiddenCount: clients.length - limit, mode: "recent" };
}

/** Vecinos de cada nodo. */
export function buildAdjacency(edges: MemoryEdge[]) {
  const adj = new Map<string, Set<string>>();
  const link = (a: string, b: string) => {
    if (!adj.has(a)) adj.set(a, new Set());
    adj.get(a)!.add(b);
  };
  for (const e of edges) {
    link(e.from, e.to);
    link(e.to, e.from);
  }
  return adj;
}
