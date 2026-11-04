import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { MemoryStore, NewNode, NodeType, SearchHit, StoredContact, StoredEdge, StoredNode, EdgeKind } from "./store.ts";

const LIMIT = 5000;
const toVector = (v: number[]) => `[${v.join(",")}]`;

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
        embedding: toVector(n.embedding),
        created_by_agent_id: n.agentId,
      })
      .select("id, company_id, contact_id, node_type, title, content, created_by_agent_id, created_at")
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
    const { data, error } = await this.db.from("contacts").select("id, name, organization").eq("company_id", companyId).limit(LIMIT);
    if (error) throw new Error("No se pudieron leer los contactos.");
    return (data ?? []).map((c) => ({ id: c.id as string, name: c.name as string, organization: (c.organization as string | null) ?? "" }));
  }

  async listNodes(companyId: string): Promise<StoredNode[]> {
    const [slugs, { data, error }] = await Promise.all([
      this.agentSlugs(companyId),
      this.db
        .from("memory_nodes")
        .select("id, company_id, contact_id, node_type, title, content, created_by_agent_id, created_at")
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
}
