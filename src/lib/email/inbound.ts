import { z } from "zod";
import type { InboundFetcher, ReceivedEmail } from "./receiver.ts";
import type { InboundStore, ThreadRef } from "./inboundStore.ts";
import { htmlATexto } from "./untrusted.ts";
import { decidirEvento, huellaRemitente, motivoCorreoAutomatico, type DecisionEvento } from "../eventos/filtro.ts";
import type { AlmacenEventos } from "../eventos/servicio.ts";

const eventSchema = z.object({
  type: z.string(),
  data: z.object({
    email_id: z.string().min(1),
    from: z.string().optional(),
    to: z.array(z.string()).optional(),
    subject: z.string().optional(),
    message_id: z.string().optional(),
    created_at: z.string().optional(),
    text: z.string().nullish(),
    html: z.string().nullish(),
    headers: z.record(z.string(), z.string()).nullish(),
  }).loose(),
});
export type InboundEvent = z.input<typeof eventSchema>;

/** Lo que se guarda en la memoria al recibir un correo. */
export type CorreoGuardado = {
  thread: ThreadRef;
  emailId: string;
  resendId: string;
  from: string;
  subject: string;
  /** Texto del correo: contenido externo, dato no fiable. */
  text: string;
  receivedAt: string;
  contactCreated: boolean;
};

export type InboundDeps = {
  store: InboundStore;
  fetcher: InboundFetcher | null;
  /** Empresa a la que se asignan los correos sin hilo (hasta que cada empresa tenga su propia dirección de recepción). */
  defaultCompanyId: string | null;
  /** Agente que lleva los correos de remitentes sin hilo previo. */
  defaultAgentSlug: string | null;
  /** Anotar el correo en la memoria. Si falla, el webhook responde 500 y Resend reintenta (el resto ya está guardado). */
  alGuardar: (c: CorreoGuardado) => Promise<void>;
  /**
   * Filtro de eventos (sin IA): boletines, notificaciones, respuestas automáticas, rebotes, duplicados, ráfagas y límite por minuto.
   * Lo que se descarta queda registrado con su motivo y no lanza a ningún agente. Sin él (pruebas antiguas) todo crea su tarea.
   */
  eventos?: AlmacenEventos;
  ahora?: () => Date;
};

export type InboundResult =
  | { estado: "ignorado" }
  | { estado: "descartado"; motivo: string; eventoId: string; emailId: string | null }
  | { estado: "agrupado"; emailId: string; threadId: string; taskId: string; eventoId: string }
  | { estado: "sin_destino"; motivo: string }
  | { estado: "guardado" | "completado"; emailId: string; threadId: string; taskId: string; identificadoPor: "cabeceras" | "remitente" | "nuevo"; contactoCreado: boolean };

const MAX_BODY = 50_000;

/** «Nombre <dir@x.com>» → { name, address } (dirección en minúsculas). */
export function parseSender(from: string): { name: string; address: string } {
  const m = from.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  const address = (m ? m[2] : from).trim().toLowerCase();
  const name = (m?.[1] ?? "").trim() || address.split("@")[0];
  return { name, address };
}

/** Message-ID de una cabecera: <a@x> <b@x> → ["<a@x>", "<b@x>"]. */
export const parseMessageIds = (value: string | undefined | null) => value?.match(/<[^<>\s]+>/g) ?? [];

const header = (headers: Record<string, string>, name: string) =>
  Object.entries(headers).find(([k]) => k.toLowerCase() === name)?.[1];

/** Asunto sin «Re:», «RV:», «Fwd:»… al principio, para nombrar el hilo. */
export const baseSubject = (s: string) => s.replace(/^(\s*(re|rv|fw|fwd|reenv)\s*(\[\d+\])?:\s*)+/i, "").trim() || "(sin asunto)";

/**
 * Procesa un correo recibido (evento `email.received` de Resend). Todo el contenido es dato no fiable: aquí solo se
 * guarda y se avisa al agente; nada de lo que diga el correo se interpreta ni se ejecuta.
 * Es idempotente: si el webhook se repite, no duplica el correo y completa lo que hubiera quedado a medias.
 */
export async function procesarCorreoRecibido(deps: InboundDeps, raw: InboundEvent): Promise<InboundResult> {
  const event = eventSchema.parse(raw);
  if (event.type !== "email.received") return { estado: "ignorado" };
  const d = event.data;

  // El webhook solo trae un resumen: el texto completo y las cabeceras se piden a la API de Resend.
  let full: ReceivedEmail | null = null;
  if (!((d.text || d.html) && d.headers)) {
    if (!deps.fetcher) throw new Error("Falta RESEND_API_KEY para recuperar el correo recibido.");
    full = await deps.fetcher.get(d.email_id);
  }
  const from = full?.from ?? d.from ?? "";
  const subject = (full?.subject ?? d.subject ?? "").trim() || "(sin asunto)";
  const headers = full?.headers ?? d.headers ?? {};
  const rawText = full ? full.text || (full.html ? htmlATexto(full.html) : "") : d.text || (d.html ? htmlATexto(d.html) : "");
  const text = rawText.replaceAll("\u0000", "").slice(0, MAX_BODY);
  const to = (full?.to ?? d.to ?? [])[0] ?? "";
  const receivedAt = full?.createdAt ?? d.created_at ?? new Date().toISOString();
  const messageId = parseMessageIds(header(headers, "message-id"))[0] ?? parseMessageIds(full?.messageId ?? d.message_id)[0] ?? null;
  const inReplyTo = parseMessageIds(header(headers, "in-reply-to"))[0] ?? null;
  const references = parseMessageIds(header(headers, "references"));
  const sender = parseSender(from);
  if (!sender.address.includes("@")) return { estado: "sin_destino", motivo: "El correo no trae una dirección de remitente válida." };

  const existing = await deps.store.findInboundByResendId(d.email_id);
  const ahora = (deps.ahora ?? (() => new Date()))();
  const automatico = motivoCorreoAutomatico({ from: sender.address, subject, headers });
  let thread: ThreadRef;
  let emailId: string;
  let identificadoPor: "cabeceras" | "remitente" | "nuevo" = "cabeceras";
  let contactCreated = false;

  if (existing) {
    ({ thread, emailId } = existing);
  } else {
    // 1) Cabeceras: el último Message-ID citado primero (In-Reply-To, luego References de más reciente a más antiguo).
    const ids = [...(inReplyTo ? [inReplyTo] : []), ...[...references].reverse()];
    let found = ids.length ? await deps.store.findThreadByMessageIds(ids) : null;
    // 2) Remitente: último hilo con ese contacto.
    if (!found && deps.defaultCompanyId) {
      found = await deps.store.findLatestThreadForAddress(deps.defaultCompanyId, sender.address);
      identificadoPor = "remitente";
    }
    // Un correo automático de alguien sin hilo (boletín, notificación, rebote…) no crea contacto ni hilo: solo queda registrado.
    if (!found && automatico && deps.eventos && deps.defaultCompanyId) {
      const decision = await decidirEvento(deps.eventos, { companyId: deps.defaultCompanyId, canal: "correo", clave: messageId, remitente: sender.address, automatico }, ahora);
      const eventoId = await registrarDecision(deps.eventos, deps.defaultCompanyId, decision, { clave: messageId, remitente: sender.address, emailId: null, contactId: null, agentId: null, taskId: null });
      return { estado: "descartado", motivo: decision.estado === "descartado" ? decision.motivo : "Correo automático.", eventoId, emailId: null };
    }
    // 3) Nada: contacto nuevo (si no existe) y un hilo nuevo con el agente por defecto.
    if (!found) {
      if (!deps.defaultCompanyId || !deps.defaultAgentSlug) {
        return { estado: "sin_destino", motivo: "No se pudo identificar el hilo y no hay empresa o agente por defecto (DEV_COMPANY_ID, INBOUND_DEFAULT_AGENT_SLUG)." };
      }
      const agent = await deps.store.findAgentBySlug(deps.defaultCompanyId, deps.defaultAgentSlug);
      if (!agent) return { estado: "sin_destino", motivo: `No existe el agente por defecto «${deps.defaultAgentSlug}».` };
      let contact = await deps.store.findContactByEmail(deps.defaultCompanyId, sender.address);
      if (!contact) {
        contact = await deps.store.createContact(deps.defaultCompanyId, { name: sender.name, email: sender.address });
        contactCreated = true;
      }
      const threadId = await deps.store.createThread(deps.defaultCompanyId, { contactId: contact.id, agentId: agent.id, subject: baseSubject(subject) });
      found = {
        companyId: deps.defaultCompanyId, threadId, subject: baseSubject(subject), contactId: contact.id, contactName: contact.name, contactEmail: contact.email,
        agentId: agent.id, agentSlug: agent.slug, agentName: agent.name, agentModel: agent.model,
      };
      identificadoPor = "nuevo";
    }
    thread = found;
    // Duplicado (el mismo Message-ID ya llegó por otro envío): no se guarda dos veces ni lanza a nadie.
    if (deps.eventos && messageId && !automatico && (await deps.eventos.existeClave(thread.companyId, "correo", messageId))) {
      const decision = await decidirEvento(deps.eventos, { companyId: thread.companyId, canal: "correo", clave: messageId, remitente: sender.address }, ahora);
      const eventoId = await registrarDecision(deps.eventos, thread.companyId, decision, { clave: messageId, remitente: sender.address, emailId: null, contactId: thread.contactId, agentId: thread.agentId, taskId: null });
      return { estado: "descartado", motivo: decision.estado === "descartado" ? decision.motivo : "Duplicado.", eventoId, emailId: null };
    }
    emailId = await deps.store.insertInbound(thread.companyId, thread.threadId, {
      fromAddress: sender.address, toAddress: to, subject, body: text, messageId, inReplyTo, references, resendId: d.email_id, occurredAt: receivedAt,
      attachments: full?.attachments ?? [],
    });
    await deps.store.markThreadReplied(thread.companyId, thread.threadId, receivedAt);
  }

  // Filtro de eventos: solo un correo nuevo (un reintento del webhook ya pasó por aquí y completa lo que quedó a medias).
  let eventoId: string | null = null;
  let enColaHasta: Date | null = null;
  if (deps.eventos && !existing) {
    const decision = await decidirEvento(deps.eventos, { companyId: thread.companyId, canal: "correo", clave: messageId, remitente: sender.address, automatico }, ahora);
    const fila = { clave: messageId, remitente: sender.address, emailId, contactId: thread.contactId, agentId: thread.agentId };
    if (decision.estado === "descartado") {
      // Queda guardado en su hilo (la empresa lo ve), pero no lanza a ningún agente ni se anota en la memoria.
      eventoId = await registrarDecision(deps.eventos, thread.companyId, decision, { ...fila, taskId: null });
      return { estado: "descartado", motivo: decision.motivo, eventoId, emailId };
    }
    if (decision.estado === "agrupado") {
      eventoId = await registrarDecision(deps.eventos, thread.companyId, decision, { ...fila, taskId: decision.taskId });
      await deps.alGuardar({ thread, emailId, resendId: d.email_id, from: sender.address, subject, text, receivedAt, contactCreated });
      return { estado: "agrupado", emailId, threadId: thread.threadId, taskId: decision.taskId, eventoId };
    }
    eventoId = await registrarDecision(deps.eventos, thread.companyId, decision, { ...fila, taskId: null });
    if (decision.estado === "en_cola") enColaHasta = decision.hasta;
  }

  // Tarea para el agente que envió el correo original (el del hilo): que lo lea y proponga el siguiente paso.
  const { taskId } = await deps.store.ensureTask(thread.companyId, {
    agentId: thread.agentId, emailId, model: thread.agentModel, eventoId, enColaHasta,
    title: `Leer la respuesta de ${thread.contactName} y proponer el siguiente paso`.slice(0, 200),
  });
  if (eventoId && deps.eventos) await deps.eventos.vincularTarea(thread.companyId, eventoId, taskId);

  await deps.alGuardar({ thread, emailId, resendId: d.email_id, from: sender.address, subject, text, receivedAt, contactCreated });

  return { estado: existing ? "completado" : "guardado", emailId, threadId: thread.threadId, taskId, identificadoPor: existing ? "cabeceras" : identificadoPor, contactoCreado: contactCreated };
}

/** Deja el evento registrado con la decisión del filtro (sin el contenido: el correo ya está en `emails`). */
function registrarDecision(
  eventos: AlmacenEventos, companyId: string, decision: DecisionEvento,
  f: { clave: string | null; remitente: string; emailId: string | null; contactId: string | null; agentId: string | null; taskId: string | null },
): Promise<string> {
  return eventos.registrar({
    companyId, canal: "correo", clave: f.clave, remitenteHash: huellaRemitente(f.remitente), contactId: f.contactId, emailId: f.emailId, agentId: f.agentId,
    taskId: f.taskId, estado: decision.estado, motivo: decision.estado === "aceptado" ? null : decision.motivo, contenido: null,
  });
}
