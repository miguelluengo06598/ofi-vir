"use client";

import { Plus } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useApprovals } from "@/components/ApprovalsProvider";
import { GlassPanel, PillButton } from "@/components/glass";
import { buildOffice } from "@/data/departments";
import { initialConversations, simulatedReply, type Conversation, type Message } from "@/data/messages";
import { AgentProfile } from "./AgentProfile";
import { ChatPanel } from "./ChatPanel";
import { ConversationList, type Tab } from "./ConversationList";

const REPLY_DELAY_MS = 1600;

const nowTime = () => new Date().toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });

let messageCounter = 0;
const newMessage = (from: Message["from"], text: string): Message => ({
  id: `new-${++messageCounter}`,
  from,
  text,
  time: nowTime(),
  day: "Hoy",
});

/** Aplica un cambio a la conversación del agente (creándola si no existe) y la sube al principio. */
function touch(list: Conversation[], agentId: string, update: (c: Conversation) => Conversation) {
  const current = list.find((c) => c.agentId === agentId) ?? { agentId, messages: [], unread: 0 };
  return [update(current), ...list.filter((c) => c.agentId !== agentId)];
}

export function MessagesView() {
  const { resolved, hired } = useApprovals();
  const officeAgents = useMemo(
    () => buildOffice(resolved, hired).summaries.flatMap((s) => s.agents),
    [resolved, hired],
  );
  const firstId = initialConversations[0].agentId;
  const [conversations, setConversations] = useState<Conversation[]>(initialConversations);
  const [selectedId, setSelectedId] = useState(firstId);
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<Tab>("all");
  const [picking, setPicking] = useState(false);
  const [mobileChat, setMobileChat] = useState(false);
  const [draft, setDraft] = useState("");
  const [typing, setTyping] = useState<string[]>([]);
  const selectedRef = useRef(selectedId);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    selectedRef.current = selectedId;
  }, [selectedId]);
  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, []);

  const agent = officeAgents.find((a) => a.id === selectedId)!;
  const conversation = conversations.find((c) => c.agentId === selectedId) ?? {
    agentId: selectedId,
    messages: [],
    unread: 0,
  };

  function select(agentId: string) {
    setSelectedId(agentId);
    setConversations((cs) => cs.map((c) => (c.agentId === agentId ? { ...c, unread: 0 } : c)));
    setPicking(false);
    setMobileChat(true);
    setDraft("");
  }

  function start(agentId: string) {
    setConversations((cs) => touch(cs, agentId, (c) => c));
    select(agentId);
  }

  function send(text: string) {
    const body = text.trim();
    if (!body) return;
    const target = officeAgents.find((a) => a.id === selectedId)!;
    setConversations((cs) => touch(cs, target.id, (c) => ({ ...c, messages: [...c.messages, newMessage("me", body)] })));
    setDraft("");
    setTyping((t) => [...t, target.id]);

    timers.current.push(
      setTimeout(() => {
        setConversations((cs) =>
          touch(cs, target.id, (c) => ({
            ...c,
            messages: [...c.messages, newMessage("agent", simulatedReply(target, c.messages.length))],
            unread: selectedRef.current === target.id ? 0 : c.unread + 1,
          })),
        );
        setTyping((t) => t.filter((id) => id !== target.id));
      }, REPLY_DELAY_MS),
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-h1">Mensajes</h1>
          <p className="text-body text-ink-2">Habla con tus agentes</p>
        </div>
        <PillButton
          icon={Plus}
          active={picking}
          onClick={() => {
            setPicking((p) => !p);
            setMobileChat(false);
          }}
        >
          Nueva conversación
        </PillButton>
      </div>

      <div className="grid h-[calc(100dvh-22rem)] min-h-[28rem] grid-cols-1 gap-4 lg:h-[calc(100dvh-15rem)] lg:grid-cols-[300px_minmax(0,1fr)] xl:grid-cols-[320px_minmax(0,1fr)_300px]">
        <GlassPanel
          as="section"
          aria-label="Conversaciones"
          className={`enter min-h-0 flex-col ${mobileChat ? "hidden" : "flex"} lg:flex`}
        >
          <ConversationList
            agents={officeAgents}
            conversations={conversations}
            selectedId={selectedId}
            query={query}
            tab={tab}
            picking={picking}
            onQuery={setQuery}
            onTab={setTab}
            onSelect={select}
            onStart={start}
          />
        </GlassPanel>

        <GlassPanel
          as="section"
          aria-label="Conversación"
          className={`enter min-h-0 flex-col ${mobileChat ? "flex" : "hidden"} lg:flex`}
        >
          <ChatPanel
            agent={agent}
            conversation={conversation}
            typing={typing.includes(selectedId)}
            draft={draft}
            onDraft={setDraft}
            onSend={send}
            onBack={() => setMobileChat(false)}
          />
        </GlassPanel>

        <GlassPanel as="aside" aria-label="Ficha del agente" className="enter hidden min-h-0 flex-col xl:flex">
          <AgentProfile agent={agent} />
        </GlassPanel>
      </div>
    </div>
  );
}
