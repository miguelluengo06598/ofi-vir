import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { normalizeKey, textScore } from "./text.ts";
import type {
  EdgeKind, ErasureCounts, MemoryStore, Neighbor, NewContact, NewNode, NodeType, SearchHit,
  StoredContact, StoredEdge, StoredEmail, StoredNode,
} from "./store.ts";

const LIMIT = 5000;
const CONTACT_COLS = "id, name, email, organization, job_title";
const toContact = (c: Record<string, unknown>): StoredContact => ({
  id: c.id as string,
  name: c.name as string,
  email: c.email as string,
  organization: (c.organization as string | null) ?? "",
  jobTitle: (c.job_title as string | null) ?? "",
});
const toVector = (v: number[]) => `[${v.join(",")}]`;
const NODE_COLS = "id, company_id, contact_id, node_type, title, content, confidence, external, source_task_id, created_by_agent_id, created_at";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Escapa % _ \ para usar un texto como patrón exacto de ilike. */
const likeExact = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

/**
 * Almacén sobre Supabase con la clave `service_role` (solo servidor). Esa clave se salta la RLS,
 * así que CADA consulta filtra por `company_id` a mano.
 */
export class SupabaseMemoryStore implements MemoryStore {
  private readonly db: SupabaseClient;

  constructor(db: SupabaseClient) {
    this.db = db;
  }

  static fromEnv(): SupabaseMemoryStore | null {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
    if (!url || !key) return null;
    return new SupabaseMemoryStore(createClient(url, key, { auth: { persistSession: false } }));
  }

  private async agentSlugs(companyId: string): Promise<Map<string, string>> {
    const { data, error } = await this.db.from("agents").select("id, slug").eq("company_id", companyId);
    if (error) throw new Error("No se pudieron leer los agentes.");
    return new Map((data ?? []).map((a) => [a.id as string, a.slug as string]));
  }

  private toNode(r: Record<string, unknown>, slugs: Map<string, string>): StoredNode {
    return {
      id: r.id as string,
      companyId: r.company_id as string,
      contactId: (r.contact_id as string | null) ?? null,
      type: r.node_type as NodeType,
      title: r.title as string,
      content: r.content as string,
      confidence: Number(r.confidence ?? 1),
      external: Boolean(r.external),
      sourceTaskId: (r.source_task_id as string | null) ?? null,
      agentSlug: r.created_by_agent_id ? (slugs.get(r.created_by_agent_id as string) ?? null) : null,
      createdAt: r.created_at as string,
    };
  }

  async insertNode(companyId: string, n: NewNode): Promise<StoredNode> {
    const { data, error } = await this.db
      .from("memory_nodes")
      .insert({
        company_id: companyId,
        contact_id: n.contactId,
        node_type: n.type,
        title: n.title,
        content: n.content,
        embedding: n.embedding ? toVector(n.embedding) : null,
        created_by_agent_id: n.agentId,
        external: n.external ?? false,
        confidence: n.confidence ?? 1,
        source_task_id: n.sourceTaskId ?? null,
      })
      .select(NODE_COLS)
      .single();
    if (error || !data) throw new Error("No se pudo guardar el nodo de memoria.");
    return this.toNode(data, await this.agentSlugs(companyId));
  }

  async searchByEmbedding(companyId: string, embedding: number[], limit: number): Promise<SearchHit[]> {
    const { data, error } = await this.db.rpc("search_memory_nodes", {
      p_company_id: companyId,
      query_embedding: toVector(embedding),
      match_count: limit,
    });
    if (error) throw new Error("No se pudo buscar en la memoria.");
    return (data ?? []).map((r: { id: string; title: string; node_type: NodeType; similarity: number }) => ({
      id: r.id,
      title: r.title,
      type: r.node_type,
      similarity: r.similarity,
    }));
  }

  async listContacts(companyId: string): Promise<StoredContact[]> {
    const { data, error } = await this.db.from("contacts").select(CONTACT_COLS).eq("company_id", companyId).limit(LIMIT);
    if (error) throw new Error("No se pudieron leer los contactos.");
    return (data ?? []).map(toContact);
  }

  async listNodes(companyId: string): Promise<StoredNode[]> {
    const [slugs, { data, error }] = await Promise.all([
      this.agentSlugs(companyId),
      this.db
        .from("memory_nodes")
        .select(NODE_COLS)
        .eq("company_id", companyId)
        .limit(LIMIT),
    ]);
    if (error) throw new Error("No se pudieron leer los nodos de memoria.");
    return (data ?? []).map((r) => this.toNode(r, slugs));
  }

  async listEdges(companyId: string): Promise<StoredEdge[]> {
    const { data, error } = await this.db.from("memory_edges").select("id, from_node_id, to_node_id, kind").eq("company_id", companyId).limit(LIMIT);
    if (error) throw new Error("No se pudieron leer las conexiones de memoria.");
    return (data ?? []).map((e) => ({ id: e.id as string, from: e.from_node_id as string, to: e.to_node_id as string, kind: e.kind as EdgeKind }));
  }

  async findContactByEmail(companyId: string, email: string): Promise<StoredContact | null> {
    const { data, error } = await this.db.from("contacts").select(CONTACT_COLS).eq("company_id", companyId).eq("email", email.toLowerCase()).maybeSingle();
    if (error) throw new Error("No se pudo buscar el contacto.");
    return data ? toContact(data) : null;
  }

  async getContact(companyId: string, contactId: string): Promise<StoredContact | null> {
    const { data, error } = await this.db.from("contacts").select(CONTACT_COLS).eq("company_id", companyId).eq("id", contactId).maybeSingle();
    if (error) throw new Error("No se pudo leer el contacto.");
    return data ? toContact(data) : null;
  }

  async insertContact(companyId: string, c: NewContact): Promise<{ contact: StoredContact; created: boolean }> {
    const { data, error } = await this.db
      .from("contacts")
      .insert({ company_id: companyId, name: c.name, email: c.email.toLowerCase(), organization: c.organization ?? null, job_title: c.jobTitle ?? null })
      .select(CONTACT_COLS)
      .single();
    if (data) return { contact: toContact(data), created: true };
    // 23505 = otro proceso lo creó a la vez (mismo correo en la empresa): reutilizarlo.
    if (error?.code === "23505") {
      const existing = await this.findContactByEmail(companyId, c.email);
      if (existing) return { contact: existing, created: false };
    }
    throw new Error("No se pudo guardar el contacto.");
  }

  async findNodeByTitle(companyId: string, contactId: string | null, type: NodeType, title: string): Promise<StoredNode | null> {
    let q = this.db.from("memory_nodes").select(NODE_COLS).eq("company_id", companyId).eq("node_type", type).ilike("title", likeExact(title.trim())).limit(20);
    q = contactId ? q.eq("contact_id", contactId) : q.is("contact_id", null);
    const { data, error } = await q;
    if (error) throw new Error("No se pudo buscar el nodo.");
    const key = normalizeKey(title);
    const hit = (data ?? []).find((r) => normalizeKey(r.title as string) === key) ?? (data ?? [])[0];
    return hit ? this.toNode(hit, await this.agentSlugs(companyId)) : null;
  }

  async getNodes(companyId: string, ids: string[]): Promise<StoredNode[]> {
    if (ids.length === 0) return [];
    const [slugs, { data, error }] = await Promise.all([
      this.agentSlugs(companyId),
      this.db.from("memory_nodes").select(NODE_COLS).eq("company_id", companyId).in("id", ids),
    ]);
    if (error) throw new Error("No se pudieron leer los nodos.");
    return (data ?? []).map((r) => this.toNode(r, slugs));
  }

  async updateNode(
    companyId: string,
    id: string,
    ch: { title?: string; content?: string; confidence?: number; embedding?: number[] },
  ): Promise<StoredNode | null> {
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (ch.title !== undefined) patch.title = ch.title;
    if (ch.content !== undefined) patch.content = ch.content;
    if (ch.confidence !== undefined) patch.confidence = ch.confidence;
    if (ch.embedding) patch.embedding = toVector(ch.embedding);
    const { data, error } = await this.db.from("memory_nodes").update(patch).eq("company_id", companyId).eq("id", id).select(NODE_COLS).maybeSingle();
    if (error) throw new Error("No se pudo corregir el nodo.");
    return data ? this.toNode(data, await this.agentSlugs(companyId)) : null;
  }

  async insertEdge(companyId: string, e: { from: string; to: string; kind: EdgeKind; agentId: string }): Promise<boolean> {
    const { data, error } = await this.db
      .from("memory_edges")
      .upsert(
        { company_id: companyId, from_node_id: e.from, to_node_id: e.to, kind: e.kind, created_by_agent_id: e.agentId },
        { onConflict: "company_id,from_node_id,to_node_id,kind", ignoreDuplicates: true },
      )
      .select("id");
    if (error) throw new Error("No se pudo guardar la conexión.");
    return (data ?? []).length > 0;
  }

  async searchByText(companyId: string, terms: string[], limit: number): Promise<SearchHit[]> {
    // Los términos son solo [a-z0-9] (ver queryTerms), así que son seguros dentro del filtro.
    const safe = terms.filter((t) => /^[a-z0-9]+$/.test(t));
    if (safe.length === 0) return [];
    const filter = safe.flatMap((t) => [`title.ilike.%${t}%`, `content.ilike.%${t}%`]).join(",");
    const { data, error } = await this.db.from("memory_nodes").select("id, title, content, node_type").eq("company_id", companyId).or(filter).limit(200);
    if (error) throw new Error("No se pudo buscar en la memoria.");
    return (data ?? [])
      .map((r) => ({ id: r.id as string, title: r.title as string, type: r.node_type as NodeType, similarity: textScore(safe, r.title as string, r.content as string) }))
      .filter((h) => h.similarity > 0)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);
  }

  async neighbors(companyId: string, nodeIds: string[], limitPerNode: number): Promise<Neighbor[]> {
    const ids = nodeIds.filter((i) => UUID.test(i));
    if (ids.length === 0) return [];
    const list = ids.join(",");
    const { data, error } = await this.db
      .from("memory_edges")
      .select("from_node_id, to_node_id, kind")
      .eq("company_id", companyId)
      .or(`from_node_id.in.(${list}),to_node_id.in.(${list})`)
      .limit(500);
    if (error) throw new Error("No se pudieron leer las conexiones.");
    const wanted = new Set(ids);
    const pairs = (data ?? []).flatMap((e) => {
      const from = e.from_node_id as string;
      const to = e.to_node_id as string;
      const out: { originId: string; otherId: string; kind: EdgeKind; direction: "sale" | "entra" }[] = [];
      if (wanted.has(from)) out.push({ originId: from, otherId: to, kind: e.kind as EdgeKind, direction: "sale" });
      if (wanted.has(to)) out.push({ originId: to, otherId: from, kind: e.kind as EdgeKind, direction: "entra" });
      return out;
    });
    const nodes = new Map((await this.getNodes(companyId, [...new Set(pairs.map((p) => p.otherId))])).map((n) => [n.id, n]));
    const perNode = new Map<string, number>();
    const result: Neighbor[] = [];
    for (const p of pairs) {
      const node = nodes.get(p.otherId);
      const used = perNode.get(p.originId) ?? 0;
      if (!node || used >= limitPerNode) continue;
      perNode.set(p.originId, used + 1);
      result.push({ originId: p.originId, kind: p.kind, direction: p.direction, node });
    }
    return result;
  }

  async listContactNodes(companyId: string, contactId: string): Promise<StoredNode[]> {
    const [slugs, { data, error }] = await Promise.all([
      this.agentSlugs(companyId),
      this.db.from("memory_nodes").select(NODE_COLS).eq("company_id", companyId).eq("contact_id", contactId).order("created_at").limit(LIMIT),
    ]);
    if (error) throw new Error("No se pudieron leer los nodos del contacto.");
    return (data ?? []).map((r) => this.toNode(r, slugs));
  }

  async listContactEmails(companyId: string, contactId: string): Promise<StoredEmail[]> {
    const { data: threads, error: e1 } = await this.db.from("email_threads").select("id").eq("company_id", companyId).eq("contact_id", contactId);
    if (e1) throw new Error("No se pudieron leer los hilos del contacto.");
    const threadIds = (threads ?? []).map((t) => t.id as string);
    if (threadIds.length === 0) return [];
    const { data, error } = await this.db
      .from("emails")
      .select("id, direction, subject, body, delivery_status, occurred_at")
      .eq("company_id", companyId)
      .in("thread_id", threadIds)
      .order("occurred_at")
      .limit(LIMIT);
    if (error) throw new Error("No se pudieron leer los correos del contacto.");
    return (data ?? []).map((m) => ({
      id: m.id as string,
      direction: m.direction as "inbound" | "outbound",
      subject: m.subject as string,
      body: m.body as string,
      status: m.delivery_status as string,
      occurredAt: m.occurred_at as string,
    }));
  }

  async eraseContact(companyId: string, contactId: string, requestedBy: string): Promise<ErasureCounts> {
    const { data, error } = await this.db.rpc("erase_contact", { p_company_id: companyId, p_contact_id: contactId, p_requested_by: requestedBy });
    if (error) throw new Error(error.code === "P0002" ? "Contacto no encontrado" : "No se pudo borrar el contacto.");
    return data as ErasureCounts;
  }
}
