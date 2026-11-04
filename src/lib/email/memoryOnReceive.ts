import { embedderFromEnv } from "../memory/embedderFromEnv.ts";
import { createMemoryService } from "../memory/service.ts";
import { SupabaseMemoryStore } from "../memory/supabaseStore.ts";
import type { CorreoGuardado } from "./inbound.ts";
import { baseSubject } from "./inbound.ts";

const MAX_NODE_TEXT = 1500;

/**
 * Anota un correo recibido en la memoria: el correo (marcado como contenido externo), el hilo y el contacto, conectados.
 *   contacto ─recibió→ correo        contacto ─respondió→ hilo        hilo ─recibió→ correo
 * Sin vector si Voyage no está disponible: el correo no se pierde y se encuentra por texto.
 */
export async function anotarCorreoRecibido(c: CorreoGuardado): Promise<void> {
  const store = SupabaseMemoryStore.fromEnv();
  if (!store) throw new Error("Falta la configuración de Supabase para anotar el correo recibido.");
  const svc = createMemoryService({ store, embedder: embedderFromEnv() });
  const subject = baseSubject(c.subject);
  const when = c.receivedAt.slice(0, 16).replace("T", " ");
  await svc.guardarRecuerdo(
    c.thread.companyId,
    {
      agentId: c.thread.agentId,
      contacto: { nombre: c.thread.contactName, email: c.thread.contactEmail },
      nodos: [
        { clave: "c", tipo: "contacto", titulo: c.thread.contactName },
        { clave: "h", tipo: "correo", titulo: `Hilo: ${subject}`.slice(0, 200), contenido: `Conversación por correo con ${c.thread.contactName}.` },
        // Contenido externo: dato no fiable, marcado como tal. Nunca se mezcla con instrucciones de un agente.
        { clave: "r", tipo: "correo", titulo: `Correo recibido ${when}: ${subject}`.slice(0, 200), contenido: c.text.slice(0, MAX_NODE_TEXT), externo: true },
      ],
      conexiones: [
        { desde: "c", hasta: "r", tipo: "recibio" },
        { desde: "c", hasta: "h", tipo: "respondio" },
        { desde: "h", hasta: "r", tipo: "recibio" },
      ],
    },
    { permitirSinVector: true },
  );
}
