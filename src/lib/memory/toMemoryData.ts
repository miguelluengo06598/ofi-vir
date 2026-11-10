import type { MemoryData } from "@/data/memory";
import type { StoredContact, StoredEdge, StoredNode } from "./store.ts";

/**
 * Convierte filas de la base en la forma que ya usa la vista Memoria (`MemoryData`).
 * Cada contacto es un racimo. Se omiten los nodos sin contacto o creados por una persona
 * (la vista aún solo sabe dibujar nodos de agente dentro de un racimo).
 */
export function toMemoryData(g: { contacts: StoredContact[]; nodes: StoredNode[]; edges: StoredEdge[] }): MemoryData {
  // El conocimiento (fragmentos de webs y documentos) no es parte del grafo de contactos.
  const kept = g.nodes.flatMap((n) => (n.contactId !== null && n.agentSlug !== null && n.type !== "conocimiento" ? [{ ...n, type: n.type }] : []));
  const keptIds = new Set(kept.map((n) => n.id));

  const lastBy = new Map<string, string>();
  for (const n of kept) {
    const prev = lastBy.get(n.contactId!);
    if (!prev || n.createdAt > prev) lastBy.set(n.contactId!, n.createdAt);
  }

  return {
    clients: g.contacts
      .filter((c) => lastBy.has(c.id))
      .map((c) => ({ id: c.id, name: c.name, company: c.organization, lastActivity: lastBy.get(c.id)! })),
    nodes: kept.map((n) => ({
      id: n.id,
      clientId: n.contactId!,
      type: n.type,
      label: n.title,
      detail: n.content,
      createdAt: n.createdAt,
      creatorId: n.agentSlug!,
      events: [],
    })),
    edges: g.edges.filter((e) => keptIds.has(e.from) && keptIds.has(e.to)).map((e) => ({ id: e.id, from: e.from, to: e.to, kind: e.kind })),
  };
}
