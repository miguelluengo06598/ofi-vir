import { agents } from "@/data/agents";
import type { ResolvedThread } from "@/data/emails";
import type { LiveMessage } from "@/lib/email/inboundStore";

const previewOf = (text: string) => text.replace(/\s+/g, " ").trim().slice(0, 120);

/** Hilos con correos recibidos en vivo de un contacto (por su dirección). Los mensajes son contenido externo: solo texto. */
export function liveThreadsFor(contactId: string, contactEmail: string, messages: LiveMessage[]): ResolvedThread[] {
  const mine = messages.filter((m) => m.contactEmail.toLowerCase() === contactEmail.toLowerCase());
  const byThread = new Map<string, LiveMessage[]>();
  for (const m of mine) byThread.set(m.threadId, [...(byThread.get(m.threadId) ?? []), m]);
  return [...byThread.entries()].map(([threadId, list]) => {
    const sorted = [...list].sort((a, b) => a.receivedAt.localeCompare(b.receivedAt));
    const last = sorted[sorted.length - 1];
    return {
      id: `live-${threadId}`,
      contactId,
      agentId: agents.find((a) => a.id === last.agentSlug)?.id ?? agents[0].id,
      subject: last.threadSubject,
      status: "replied" as const,
      statusNote: "Recibido por correo",
      messages: sorted.map((m) => ({ id: m.emailId, from: "contact" as const, at: m.receivedAt, body: m.text })),
      lastAt: last.receivedAt,
      preview: previewOf(last.text),
    };
  });
}
