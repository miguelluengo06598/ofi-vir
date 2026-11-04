import type { MemoryStore, NewNode, SearchHit, StoredContact, StoredEdge, StoredNode } from "./store.ts";

/** Almacén en memoria para tests: reproduce el aislamiento por empresa y la búsqueda por coseno. */
export class InMemoryStore implements MemoryStore {
  private nodes: (StoredNode & { embedding: number[] })[] = [];
  contacts: (StoredContact & { companyId: string })[] = [];
  edges: (StoredEdge & { companyId: string })[] = [];
  private seq = 0;

  async insertNode(companyId: string, n: NewNode): Promise<StoredNode> {
    const node = {
      id: `n${++this.seq}`,
      companyId,
      contactId: n.contactId,
      type: n.type,
      title: n.title,
      content: n.content,
      agentSlug: n.agentId,
      createdAt: new Date().toISOString(),
      embedding: n.embedding,
    };
    this.nodes.push(node);
    return strip(node);
  }

  async searchByEmbedding(companyId: string, q: number[], limit: number): Promise<SearchHit[]> {
    return this.nodes
      .filter((n) => n.companyId === companyId)
      .map((n) => ({ id: n.id, title: n.title, type: n.type, similarity: cosine(n.embedding, q) }))
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);
  }

  async listContacts(companyId: string) {
    return this.contacts.filter((c) => c.companyId === companyId);
  }
  async listNodes(companyId: string) {
    return this.nodes.filter((n) => n.companyId === companyId).map(strip);
  }
  async listEdges(companyId: string) {
    return this.edges.filter((e) => e.companyId === companyId);
  }
}

const strip = (n: StoredNode & { embedding: number[] }): StoredNode => {
  const { embedding, ...rest } = n;
  void embedding;
  return rest;
};

const cosine = (a: number[], b: number[]) => {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
};
