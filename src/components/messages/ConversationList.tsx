import { Search } from "lucide-react";
import { Avatar, GlassInput, PillButton } from "@/components/glass";
import { agents } from "@/data/agents";
import type { Conversation } from "@/data/messages";

export type Tab = "all" | "unread";

type Props = {
  conversations: Conversation[];
  selectedId: string;
  query: string;
  tab: Tab;
  picking: boolean;
  onQuery: (q: string) => void;
  onTab: (t: Tab) => void;
  onSelect: (agentId: string) => void;
  onStart: (agentId: string) => void;
};

export function ConversationList({
  conversations,
  selectedId,
  query,
  tab,
  picking,
  onQuery,
  onTab,
  onSelect,
  onStart,
}: Props) {
  const q = query.trim().toLowerCase();
  const rows = conversations
    .map((c) => ({ c, agent: agents.find((a) => a.id === c.agentId)! }))
    .filter(({ c, agent }) => {
      if (tab === "unread" && c.unread === 0) return false;
      if (!q) return true;
      return (
        agent.name.toLowerCase().includes(q) || c.messages.some((m) => m.text.toLowerCase().includes(q))
      );
    });
  const available = agents.filter((a) => !conversations.some((c) => c.agentId === a.id));

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
      {picking ? (
        <>
          <h2 className="text-h2">Nueva conversación</h2>
          <p className="text-small text-ink-2">Elige un agente para empezar a hablar.</p>
          <ul className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
            {available.length === 0 && (
              <li className="text-small text-ink-2">Ya tienes una conversación con todos tus agentes.</li>
            )}
            {available.map((a) => (
              <li key={a.id}>
                <button
                  type="button"
                  onClick={() => onStart(a.id)}
                  className="flex w-full cursor-pointer items-center gap-3 rounded-card p-2 text-left hover:bg-glass"
                >
                  <Avatar name={a.name} tone={a.departmentId} status={a.status} />
                  <span className="min-w-0">
                    <span className="block text-small font-semibold">{a.name}</span>
                    <span className="block text-tiny text-ink-2">{a.role}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <>
          <GlassInput
            icon={Search}
            type="search"
            aria-label="Buscar conversaciones"
            placeholder="Buscar"
            value={query}
            onChange={(e) => onQuery(e.target.value)}
          />
          <div role="group" aria-label="Filtrar conversaciones" className="flex gap-2">
            <PillButton active={tab === "all"} onClick={() => onTab("all")}>
              Todos
            </PillButton>
            <PillButton active={tab === "unread"} onClick={() => onTab("unread")}>
              Sin leer
            </PillButton>
          </div>
          <ul aria-label="Conversaciones" className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
            {rows.length === 0 && <li className="p-2 text-small text-ink-2">No hay conversaciones.</li>}
            {rows.map(({ c, agent }) => {
              const last = c.messages[c.messages.length - 1];
              return (
                <li key={c.agentId}>
                  <button
                    type="button"
                    aria-current={c.agentId === selectedId ? "true" : undefined}
                    onClick={() => onSelect(c.agentId)}
                    className={`flex w-full cursor-pointer items-center gap-3 rounded-card p-2 text-left transition-colors hover:bg-glass ${
                      c.agentId === selectedId ? "bg-glass-strong" : ""
                    }`}
                  >
                    <Avatar name={agent.name} tone={agent.departmentId} status={agent.status} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-small font-semibold">{agent.name}</span>
                        <span className="shrink-0 text-tiny text-ink-3">{last?.time}</span>
                      </span>
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate text-tiny text-ink-2">
                          {last ? `${last.from === "me" ? "Tú: " : ""}${last.text}` : "Sin mensajes todavía"}
                        </span>
                        {c.unread > 0 && (
                          <span
                            aria-label={`${c.unread} sin leer`}
                            className="flex size-5 shrink-0 items-center justify-center rounded-full bg-accent text-tiny font-semibold"
                          >
                            {c.unread}
                          </span>
                        )}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
