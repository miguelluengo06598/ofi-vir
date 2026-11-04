import { z } from "zod";
import { EMBEDDING_DIMENSIONS, type Embedder } from "./embedder.ts";
import type { MemoryStore, NodeType, SearchHit, StoredNode } from "./store.ts";

const nodeTypes = ["contacto", "empresa", "campana", "correo", "dato", "tarea", "agente"] as const;

const newNodeSchema = z.object({
  contactId: z.string().uuid().nullable(),
  type: z.enum(nodeTypes),
  title: z.string().trim().min(1).max(200),
  content: z.string().max(8000).default(""),
  agentId: z.string().min(1),
});
export type AddNodeInput = z.input<typeof newNodeSchema>;

const searchSchema = z.object({ query: z.string().trim().min(1).max(500), limit: z.number().int().min(1).max(50).default(10) });

/** Texto que se convierte en vector: el título pesa igual que el contenido. */
export const embeddingText = (title: string, content: string) => (content ? `${title}\n${content}` : title);

/**
 * Servicio de memoria. Recibe el almacén y el embedder (no los crea), así los tests usan versiones falsas.
 * Todo lo que guarda es dato, nunca instrucción: el contenido se vectoriza y se guarda, no se interpreta.
 */
export function createMemoryService(deps: { store: MemoryStore; embedder: Embedder | null }) {
  const { store } = deps;

  const requireEmbedder = (): Embedder => {
    if (!deps.embedder) throw new Error("No hay embedder configurado (falta VOYAGE_API_KEY).");
    if (deps.embedder.dimensions !== EMBEDDING_DIMENSIONS) {
      throw new Error(`El embedder da ${deps.embedder.dimensions} dimensiones y la base espera ${EMBEDDING_DIMENSIONS}.`);
    }
    return deps.embedder;
  };

  return {
    /** Guarda un nodo con su vector. Si el embedder falla, no se guarda nada. */
    async addNode(companyId: string, input: AddNodeInput): Promise<StoredNode> {
      const data = newNodeSchema.parse(input);
      const embedder = requireEmbedder();
      const [embedding] = await embedder.embed([embeddingText(data.title, data.content)], "document");
      return store.insertNode(companyId, { ...data, embedding });
    },

    /** Búsqueda semántica dentro de la empresa. */
    async search(companyId: string, query: string, limit = 10): Promise<SearchHit[]> {
      const data = searchSchema.parse({ query, limit });
      const [embedding] = await requireEmbedder().embed([data.query], "query");
      return store.searchByEmbedding(companyId, embedding, data.limit);
    },

    /** Lo necesario para dibujar la red (sin vectores). */
    async loadGraph(companyId: string) {
      const [contacts, nodes, edges] = await Promise.all([
        store.listContacts(companyId),
        store.listNodes(companyId),
        store.listEdges(companyId),
      ]);
      return { contacts, nodes, edges };
    },
  };
}

export type MemoryService = ReturnType<typeof createMemoryService>;
export type { NodeType };
