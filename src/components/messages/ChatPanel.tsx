"use client";

import { motion } from "framer-motion";
import { ArrowLeft, Send } from "lucide-react";
import { useEffect, useRef } from "react";
import { Avatar, GlassInput, GlassPanel, PillButton, StatusBadge } from "@/components/glass";
import type { OfficeAgent } from "@/data/departments";
import { agentProfiles, type Conversation } from "@/data/messages";

type Props = {
  agent: OfficeAgent;
  conversation: Conversation;
  typing: boolean;
  draft: string;
  onDraft: (text: string) => void;
  onSend: (text: string) => void;
  onBack: () => void;
};

function TypingBubble({ name }: { name: string }) {
  return (
    <GlassPanel className="w-fit rounded-card! rounded-bl-sm! px-4 py-3">
      <span className="sr-only">{name} está escribiendo…</span>
      <span aria-hidden="true" className="flex items-center gap-1.5">
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="size-1.5 rounded-full bg-white"
            animate={{ opacity: [0.3, 1, 0.3] }}
            transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }}
          />
        ))}
        <span className="ml-1 text-tiny text-ink-2">escribiendo…</span>
      </span>
    </GlassPanel>
  );
}

export function ChatPanel({ agent, conversation, typing, draft, onDraft, onSend, onBack }: Props) {
  const log = useRef<HTMLDivElement>(null);
  const { messages } = conversation;
  const first = agent.name.split(" ")[0];

  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight });
  }, [messages.length, typing, agent.id]);

  return (
    <>
      <header className="flex items-center gap-3 border-b border-glass-border p-4">
        <PillButton icon={ArrowLeft} aria-label="Volver a las conversaciones" onClick={onBack} className="lg:hidden" />
        <Avatar name={agent.name} tone={agent.departmentId} status={agent.status} />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-body font-semibold">{agent.name}</h2>
          <p className="truncate text-tiny text-ink-2">{agent.role}</p>
        </div>
        <StatusBadge status={agent.status} />
      </header>

      <div
        ref={log}
        role="log"
        aria-label={`Conversación con ${agent.name}`}
        className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-4"
      >
        {messages.length === 0 && (
          <p className="m-auto text-center text-small text-ink-2">
            Aún no hay mensajes. Escribe a {first} para empezar.
          </p>
        )}
        {messages.map((msg, i) => {
          const mine = msg.from === "me";
          return (
            <div key={msg.id} className="flex flex-col gap-2">
              {msg.day !== messages[i - 1]?.day && (
                <p className="my-2 text-center text-tiny text-ink-3">{msg.day}</p>
              )}
              <div className={`flex flex-col gap-1 ${mine ? "items-end" : "items-start"}`}>
                {mine ? (
                  <p className="max-w-[80%] rounded-card rounded-br-sm bg-accent px-4 py-2.5 text-small text-white">
                    {msg.text}
                  </p>
                ) : (
                  <GlassPanel className="max-w-[80%] rounded-card! rounded-bl-sm! px-4 py-2.5 text-small">
                    {msg.text}
                  </GlassPanel>
                )}
                <span className="px-1 text-tiny text-ink-3">{msg.time}</span>
              </div>
            </div>
          );
        })}
        {typing && <TypingBubble name={first} />}
      </div>

      <div className="flex flex-col gap-3 border-t border-glass-border p-4">
        <div className="flex flex-wrap gap-2">
          {agentProfiles[agent.id].suggestions.map((s) => (
            <PillButton key={s} disabled={typing} onClick={() => onSend(s)}>
              {s}
            </PillButton>
          ))}
        </div>
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            onSend(draft);
          }}
        >
          <GlassInput
            className="flex-1"
            aria-label={`Escribe un mensaje a ${first}`}
            placeholder={`Escribe a ${first}…`}
            value={draft}
            onChange={(e) => onDraft(e.target.value)}
          />
          <PillButton
            type="submit"
            icon={Send}
            aria-label="Enviar"
            disabled={!draft.trim()}
            className="border-accent bg-accent! enabled:hover:brightness-110"
          />
        </form>
      </div>
    </>
  );
}
