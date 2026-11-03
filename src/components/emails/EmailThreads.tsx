"use client";

import { ChevronLeft, Inbox } from "lucide-react";
import { useMemo, useState } from "react";
import { useApprovals } from "@/components/ApprovalsProvider";
import { Avatar, PillButton } from "@/components/glass";
import { agentById } from "@/data/agents";
import { contactDirectory, threadsFor, type ResolvedThread } from "@/data/emails";
import { AttachmentList, EmailStatusBadge, PaperclipCount } from "./parts";

const fmtWhen = (iso: string) =>
  new Date(iso).toLocaleString("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** Pestaña «Correos» de la ficha de un contacto: hilos y, al abrir uno, la conversación. */
export function EmailThreads({ contactId }: { contactId: string }) {
  const { decisions, emailEdits } = useApprovals();
  const threads = useMemo(() => threadsFor(contactId, decisions, emailEdits), [contactId, decisions, emailEdits]);
  const [openId, setOpenId] = useState<string | null>(null);
  const open = threads.find((t) => t.id === openId);

  if (open) return <ThreadView thread={open} contactId={contactId} onBack={() => setOpenId(null)} />;

  if (threads.length === 0) {
    return (
      <p className="flex items-center gap-2 text-small text-ink-2">
        <Inbox size={16} aria-hidden="true" /> Todavía no hay correos con este contacto.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {threads.map((t) => {
        const agent = agentById(t.agentId);
        const attachments = t.messages.reduce((n, m) => n + (m.attachments?.length ?? 0), 0);
        return (
          <li key={t.id}>
            <button
              type="button"
              onClick={() => setOpenId(t.id)}
              className="flex w-full cursor-pointer flex-col gap-1 rounded-card border border-glass-border bg-black/20 p-3 text-left hover:bg-white/10"
            >
              <span className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                <EmailStatusBadge status={t.status} />
                <time dateTime={t.lastAt} className="text-tiny text-ink-2">
                  {fmtWhen(t.lastAt)}
                </time>
              </span>
              <span className="text-small font-semibold">{t.subject}</span>
              <span className="line-clamp-2 text-small text-ink-2">{t.preview}</span>
              <span className="flex flex-wrap items-center gap-x-3 text-tiny text-ink-2">
                <span>De {agent.name}</span>
                <span>
                  {t.messages.length} {t.messages.length === 1 ? "correo" : "correos"}
                </span>
                <PaperclipCount count={attachments} />
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function ThreadView({ thread, contactId, onBack }: { thread: ResolvedThread; contactId: string; onBack: () => void }) {
  const contact = contactDirectory[contactId];
  const agent = agentById(thread.agentId);
  return (
    <div className="flex flex-col gap-3">
      <PillButton icon={ChevronLeft} compact autoFocus onClick={onBack} className="self-start">
        Todos los hilos
      </PillButton>
      <div className="flex flex-col gap-1">
        <h3 className="text-body font-semibold">{thread.subject}</h3>
        <EmailStatusBadge status={thread.status} />
        {thread.statusNote && <p className="text-small text-ink-2">{thread.statusNote}</p>}
      </div>
      <ol aria-label="Correos del hilo" className="flex flex-col gap-3">
        {thread.messages.map((m) => {
          const mine = m.from === "agent";
          const name = mine ? agent.name : contact.name;
          return (
            <li key={m.id} className={`flex gap-2 ${mine ? "flex-row-reverse" : ""}`}>
              <Avatar name={name} tone={mine ? agent.departmentId : "direccion"} size={28} />
              <div
                className={`flex max-w-[88%] min-w-0 flex-col gap-2 rounded-card p-3 ${mine ? "rounded-tr-md bg-accent/35" : "rounded-tl-md bg-white/12"}`}
              >
                <p className="flex flex-wrap items-baseline justify-between gap-x-3 text-tiny text-ink-2">
                  <span className="font-semibold text-white">{name}</span>
                  <time dateTime={m.at}>{fmtWhen(m.at)}</time>
                </p>
                <p className="text-small whitespace-pre-line">{m.body}</p>
                <AttachmentList items={m.attachments} />
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
