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
  createdAt: string;
};

export type StoredEdge = { id: string; from: string; to: string; kind: EdgeKind };
export type StoredContact = { id: string; name: string; organization: string };

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
}
