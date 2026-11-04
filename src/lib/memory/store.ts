/** Acceso a datos de la memoria. Toda operación va en el contexto de una empresa (`companyId`). */

export type NodeType = "contacto" | "empresa" | "campana" | "correo" | "dato" | "tarea" | "agente";
export type EdgeKind = "trabaja_en" | "llego_por" | "recibio" | "respondio" | "tiene_pendiente" | "creado_por";

export type StoredNode = {
  id: string;
  companyId: string;
  contactId: string | null;
  type: NodeType;
  title: string;
  content: string;
  /** Slug del agente creador (el que usa la interfaz), o null si lo creó una persona. */
  agentSlug: string | null;
  /** Confianza del dato, de 0 a 1. */
  confidence: number;
  createdAt: string;
};

export type StoredEdge = { id: string; from: string; to: string; kind: EdgeKind };
export type StoredContact = { id: string; name: string; email: string; organization: string; jobTitle: string };
export type NewContact = { name: string; email: string; organization?: string; jobTitle?: string };
export type StoredEmail = {
  id: string;
  direction: "inbound" | "outbound";
  subject: string;
  body: string;
  status: string;
  occurredAt: string;
};
/** Nodo conectado a otro: `direction` es desde el punto de vista del nodo de origen. */
export type Neighbor = { originId: string; kind: EdgeKind; direction: "sale" | "entra"; node: StoredNode };
/** Recuentos de lo borrado. Nunca contiene los datos borrados. */
export type ErasureCounts = Record<"contactos" | "nodos" | "conexiones" | "hilos" | "correos" | "aprobaciones" | "nodos_huerfanos", number>;

export type NewNode = {
  contactId: string | null;
  type: NodeType;
  title: string;
  content: string;
  agentId: string;
  embedding: number[];
};

export type SearchHit = { id: string; title: string; type: NodeType; similarity: number };

export interface MemoryStore {
  insertNode(companyId: string, node: NewNode): Promise<StoredNode>;
  /** Búsqueda por similitud del coseno, solo dentro de la empresa. */
  searchByEmbedding(companyId: string, embedding: number[], limit: number): Promise<SearchHit[]>;
  listContacts(companyId: string): Promise<StoredContact[]>;
  listNodes(companyId: string): Promise<StoredNode[]>;
  listEdges(companyId: string): Promise<StoredEdge[]>;

  findContactByEmail(companyId: string, email: string): Promise<StoredContact | null>;
  getContact(companyId: string, contactId: string): Promise<StoredContact | null>;
  /** Crea el contacto; si otro proceso lo creó a la vez (mismo correo), devuelve el existente con `created: false`. */
  insertContact(companyId: string, contact: NewContact): Promise<{ contact: StoredContact; created: boolean }>;

  /** Nodo con el mismo contacto y tipo y el mismo título (sin distinguir mayúsculas ni tildes). */
  findNodeByTitle(companyId: string, contactId: string | null, type: NodeType, title: string): Promise<StoredNode | null>;
  getNodes(companyId: string, ids: string[]): Promise<StoredNode[]>;
  /** Cambia texto y/o confianza; con `embedding` nuevo si el texto cambió. null si el nodo no es de la empresa. */
  updateNode(
    companyId: string,
    id: string,
    changes: { title?: string; content?: string; confidence?: number; embedding?: number[] },
  ): Promise<StoredNode | null>;

  /** Crea la conexión; false si ya existía (misma origen, destino y tipo). */
  insertEdge(companyId: string, edge: { from: string; to: string; kind: EdgeKind; agentId: string }): Promise<boolean>;
  /** Búsqueda por palabras en título y contenido (puntuación 0..1 en `similarity`). */
  searchByText(companyId: string, terms: string[], limit: number): Promise<SearchHit[]>;
  /** Vecinos directos de los nodos dados, en ambos sentidos. */
  neighbors(companyId: string, nodeIds: string[], limitPerNode: number): Promise<Neighbor[]>;

  listContactNodes(companyId: string, contactId: string): Promise<StoredNode[]>;
  listContactEmails(companyId: string, contactId: string): Promise<StoredEmail[]>;
  /** Borra el contacto y lo que depende solo de él, en bloque, y registra la constancia. */
  eraseContact(companyId: string, contactId: string, requestedBy: string): Promise<ErasureCounts>;
}
