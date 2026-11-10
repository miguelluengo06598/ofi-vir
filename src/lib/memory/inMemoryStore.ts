import { randomUUID } from "node:crypto";
import { normalizeKey, textScore } from "./text.ts";
import type {
  EdgeKind, ErasureCounts, MemoryStore, Neighbor, NewContact, NewKnowledgeNode, NewNode, NodeType, SearchHit,
  StoredContact, StoredEdge, StoredEmail, StoredNode,
} from "./store.ts";

type Row = StoredNode & { embedding: number[] | null };

/** Almacén en memoria para tests: reproduce el aislamiento por empresa, la búsqueda y el borrado en cascada. */
export class InMemoryStore implements MemoryStore {
  private nodes: Row[] = [];
  contacts: (StoredContact & { companyId: string })[] = [];
  edges: (StoredEdge & { companyId: string })[] = [];
  emails: (StoredEmail & { companyId: string; contactId: string })[] = [];
  /** Constancias de borrado: solo ids, fecha, quién y recuentos. */
  erasures: { companyId: string; contactId: string; requestedBy: string; erasedAt: string; counts: ErasureCounts }[] = [];
  private seq = 0;

  async insertNode(companyId: string, n: NewNode): Promise<StoredNode> {
    const node: Row = {
      id: randomUUID(),
      companyId,
      contactId: n.contactId,
      type: n.type,
      title: n.title,
      content: n.content,
      agentSlug: n.agentId,
      confidence: n.confidence ?? 1,
      external: n.external ?? false,
      sourceTaskId: n.sourceTaskId ?? null,
      createdAt: new Date(Date.now() + this.seq).toISOString(),
      embedding: n.embedding,
    };
    this.nodes.push(node);
    return strip(node);
  }

  /** Ayuda para tests: correo ya existente de un contacto. */
  addEmail(companyId: string, contactId: string, e: Omit<StoredEmail, "id">) {
    this.emails.push({ ...e, id: randomUUID(), companyId, contactId });
  }

  /** Fuentes de conocimiento que ya no están «listas» (en tests): sus fragmentos no se buscan. */
  fuentesNoListas = new Set<string>();

  private visibleParaAgente(n: Row, companyId: string, agentId: string) {
    return n.companyId === companyId && n.type === "conocimiento" && !this.fuentesNoListas.has(n.knowledgeId ?? "") && (n.ambitoAgentId === null || n.ambitoAgentId === agentId);
  }
  async searchKnowledgeByEmbedding(companyId: string, agentId: string, q: number[], limit: number): Promise<SearchHit[]> {
    return this.nodes
      .filter((n) => this.visibleParaAgente(n, companyId, agentId) && n.embedding !== null)
      .map((n) => ({ id: n.id, title: n.title, type: n.type, similarity: cosine(n.embedding!, q) }))
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);
  }
  async searchKnowledgeByText(companyId: string, agentId: string, terms: string[], limit: number): Promise<SearchHit[]> {
    return this.nodes
      .filter((n) => this.visibleParaAgente(n, companyId, agentId))
      .map((n) => ({ id: n.id, title: n.title, type: n.type, similarity: textScore(terms, n.title, n.content) }))
      .filter((h) => h.similarity > 0)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);
  }
  /** Fuentes que existen (en tests, para reproducir la clave foránea). Si es null, cualquier fuente vale. */
  fuentesExistentes: Set<string> | null = null;
  async insertKnowledgeNodes(companyId: string, nodes: NewKnowledgeNode[]): Promise<number> {
    if (this.fuentesExistentes && nodes.some((n) => !this.fuentesExistentes!.has(n.knowledgeId))) throw new Error("FUENTE_BORRADA");
    for (const n of nodes) {
      this.nodes.push({
        id: randomUUID(), companyId, contactId: null, type: "conocimiento", title: n.title, content: n.content, agentSlug: null,
        confidence: 1, external: true, sourceTaskId: null, knowledgeId: n.knowledgeId, ambitoAgentId: n.ambitoAgentId,
        createdAt: new Date(Date.now() + this.seq).toISOString(), embedding: n.embedding,
      });
    }
    return nodes.length;
  }
  async deleteKnowledgeNodes(companyId: string, knowledgeId: string): Promise<number> {
    const antes = this.nodes.length;
    this.nodes = this.nodes.filter((n) => !(n.companyId === companyId && n.knowledgeId === knowledgeId));
    return antes - this.nodes.length;
  }

  async searchByEmbedding(companyId: string, q: number[], limit: number): Promise<SearchHit[]> {
    return this.nodes
      .filter((n) => n.companyId === companyId && n.type !== "conocimiento" && n.embedding !== null)
      .map((n) => ({ id: n.id, title: n.title, type: n.type, similarity: cosine(n.embedding!, q) }))
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);
  }

  async listContacts(companyId: string) {
    return this.contacts.filter((c) => c.companyId === companyId);
  }
  async listNodes(companyId: string) {
    return this.nodes.filter((n) => n.companyId === companyId && n.type !== "conocimiento").map(strip);
  }
  async listEdges(companyId: string) {
    return this.edges.filter((e) => e.companyId === companyId);
  }

  async findContactByEmail(companyId: string, email: string) {
    return this.contacts.find((c) => c.companyId === companyId && c.email === email.toLowerCase()) ?? null;
  }
  async getContact(companyId: string, contactId: string) {
    return this.contacts.find((c) => c.companyId === companyId && c.id === contactId) ?? null;
  }
  async insertContact(companyId: string, c: NewContact) {
    const existing = await this.findContactByEmail(companyId, c.email);
    if (existing) return { contact: existing, created: false };
    const contact = {
      id: randomUUID(), companyId, name: c.name, email: c.email.toLowerCase(),
      organization: c.organization ?? "", jobTitle: c.jobTitle ?? "",
    };
    this.contacts.push(contact);
    return { contact, created: true };
  }

  async findNodeByTitle(companyId: string, contactId: string | null, type: NodeType, title: string) {
    const key = normalizeKey(title);
    const n = this.nodes.find((x) => x.companyId === companyId && x.contactId === contactId && x.type === type && normalizeKey(x.title) === key);
    return n ? strip(n) : null;
  }
  async getNodes(companyId: string, ids: string[]) {
    return this.nodes.filter((n) => n.companyId === companyId && ids.includes(n.id)).map(strip);
  }
  async updateNode(companyId: string, id: string, ch: { title?: string; content?: string; confidence?: number; embedding?: number[] }) {
    const n = this.nodes.find((x) => x.companyId === companyId && x.id === id);
    if (!n) return null;
    if (ch.title !== undefined) n.title = ch.title;
    if (ch.content !== undefined) n.content = ch.content;
    if (ch.confidence !== undefined) n.confidence = ch.confidence;
    if (ch.embedding) n.embedding = ch.embedding;
    return strip(n);
  }

  async insertEdge(companyId: string, e: { from: string; to: string; kind: EdgeKind; agentId: string }) {
    if (this.edges.some((x) => x.companyId === companyId && x.from === e.from && x.to === e.to && x.kind === e.kind)) return false;
    this.edges.push({ id: randomUUID(), companyId, from: e.from, to: e.to, kind: e.kind });
    return true;
  }

  async searchByText(companyId: string, terms: string[], limit: number): Promise<SearchHit[]> {
    return this.nodes
      .filter((n) => n.companyId === companyId && n.type !== "conocimiento")
      .map((n) => ({ id: n.id, title: n.title, type: n.type, similarity: textScore(terms, n.title, n.content) }))
      .filter((h) => h.similarity > 0)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);
  }

  async neighbors(companyId: string, nodeIds: string[], limitPerNode: number): Promise<Neighbor[]> {
    const out: Neighbor[] = [];
    for (const id of nodeIds) {
      let count = 0;
      for (const e of this.edges.filter((x) => x.companyId === companyId && (x.from === id || x.to === id))) {
        const otherId = e.from === id ? e.to : e.from;
        const other = this.nodes.find((n) => n.companyId === companyId && n.id === otherId);
        if (!other || count >= limitPerNode) continue;
        out.push({ originId: id, kind: e.kind, direction: e.from === id ? "sale" : "entra", node: strip(other) });
        count++;
      }
    }
    return out;
  }

  async listContactNodes(companyId: string, contactId: string) {
    return this.nodes.filter((n) => n.companyId === companyId && n.contactId === contactId).map(strip);
  }
  async listContactEmails(companyId: string, contactId: string) {
    return this.emails
      .filter((e) => e.companyId === companyId && e.contactId === contactId)
      .map((e) => ({ id: e.id, direction: e.direction, subject: e.subject, body: e.body, status: e.status, occurredAt: e.occurredAt }));
  }

  async eraseContact(companyId: string, contactId: string, requestedBy: string): Promise<ErasureCounts> {
    if (!(await this.getContact(companyId, contactId))) throw new Error("Contacto no encontrado");
    const mine = new Set(this.nodes.filter((n) => n.companyId === companyId && n.contactId === contactId).map((n) => n.id));
    const touching = this.edges.filter((e) => e.companyId === companyId && (mine.has(e.from) || mine.has(e.to)));
    const neighborIds = new Set(
      touching.flatMap((e) => [e.from, e.to]).filter((id) => !mine.has(id) && this.nodes.find((n) => n.id === id)?.contactId === null),
    );
    const emails = this.emails.filter((e) => e.companyId === companyId && e.contactId === contactId);

    this.contacts = this.contacts.filter((c) => !(c.companyId === companyId && c.id === contactId));
    this.emails = this.emails.filter((e) => !(e.companyId === companyId && e.contactId === contactId));
    this.nodes = this.nodes.filter((n) => !mine.has(n.id));
    this.edges = this.edges.filter((e) => !(mine.has(e.from) || mine.has(e.to)));
    const before = this.nodes.length;
    this.nodes = this.nodes.filter((n) => !(neighborIds.has(n.id) && !this.edges.some((e) => e.from === n.id || e.to === n.id)));

    const counts: ErasureCounts = {
      contactos: 1, nodos: mine.size, conexiones: touching.length, hilos: emails.length ? 1 : 0,
      correos: emails.length, tareas: 0, aprobaciones: 0, nodos_huerfanos: before - this.nodes.length,
    };
    this.erasures.push({ companyId, contactId, requestedBy, erasedAt: new Date().toISOString(), counts });
    return counts;
  }
}

const strip = (n: Row): StoredNode => {
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
