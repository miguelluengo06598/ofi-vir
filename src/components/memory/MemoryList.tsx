"use client";

import { GlassPanel } from "@/components/glass";
import { nodeTypeLabel, type MemoryClient, type MemoryEdge, type MemoryNode } from "@/data/memory";
import { NodeGlyph } from "./NodeGlyph";

type Props = {
  clusters: { client: MemoryClient; nodes: MemoryNode[]; edges: MemoryEdge[] }[];
  hiddenIds: Set<string>;
  selectedId: string | null;
  matches: Set<string>;
  searching: boolean;
  adjacency: Map<string, Set<string>>;
  onSelect: (id: string) => void;
};

/** Alternativa accesible al grafo (y vista única en móvil): los mismos nodos como lista, por cliente. */
export function MemoryList({ clusters, hiddenIds, selectedId, matches, searching, adjacency, onSelect }: Props) {
  return (
    <GlassPanel as="section" aria-label="Lista de nodos de la red de conocimiento" className="enter flex flex-col gap-5 p-4 sm:p-6">
      {clusters.map(({ client, nodes }) => {
        const shown = nodes.filter((n) => !hiddenIds.has(n.id));
        if (shown.length === 0) return null;
        return (
          <section key={client.id} aria-labelledby={`mem-list-${client.id}`} className="flex flex-col gap-2">
            <h2 id={`mem-list-${client.id}`} className="text-h2">
              {client.name} <span className="text-small font-normal text-ink-2">· {client.company}</span>
            </h2>
            <ul className="flex flex-col gap-1">
              {shown.map((n) => {
                const isSel = n.id === selectedId;
                const isMatch = searching && matches.has(n.id);
                const degree = adjacency.get(n.id)?.size ?? 0;
                return (
                  <li key={n.id}>
                    <button
                      type="button"
                      aria-pressed={isSel}
                      onClick={() => onSelect(n.id)}
                      className={`flex w-full cursor-pointer items-center gap-3 rounded-card border px-3 py-2 text-left text-small ${
                        isSel ? "border-white bg-white/20" : isMatch ? "border-white/70 bg-white/15" : "border-transparent hover:bg-white/10"
                      } ${searching && !isMatch ? "opacity-60" : ""}`}
                    >
                      <NodeGlyph type={n.type} size={20} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold">{n.label}</span>
                        <span className="block text-tiny text-ink-2">
                          {nodeTypeLabel[n.type].singular} · {degree} {degree === 1 ? "conexión" : "conexiones"}
                        </span>
                      </span>
                      {isMatch && <span className="rounded-pill border border-white/50 px-2 py-0.5 text-tiny">Coincide</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </GlassPanel>
  );
}

