import { Check } from "lucide-react";
import { Avatar, GlassCard, PillButton } from "@/components/glass";
import type { MarketAgent } from "@/data/marketplace";
import { CreatorBadge, Stats, agentTone } from "./parts";

type Props = {
  agent: MarketAgent;
  hired: boolean;
  delay: number;
  onOpen: () => void;
  onHire: () => void;
};

export function MarketCard({ agent, hired, delay, onOpen, onHire }: Props) {
  return (
    <GlassCard
      department={agentTone(agent)}
      label={agent.category}
      delay={delay}
      layoutId={`market-${agent.id}`}
      onOpen={onOpen}
      className="h-full"
      actions={
        <PillButton
          icon={hired ? Check : undefined}
          active={!hired}
          aria-pressed={undefined}
          disabled={hired}
          onClick={onHire}
          className="relative z-20"
        >
          {hired ? "Contratado" : "Contratar"}
        </PillButton>
      }
    >
      <div className="flex items-center gap-3">
        <Avatar name={agent.name} tone={agentTone(agent)} size={48} />
        <div className="min-w-0">
          <p className="text-body font-semibold">{agent.name}</p>
          <p className="text-small text-ink-2">{agent.role}</p>
        </div>
      </div>
      <p className="text-small text-ink-2">{agent.summary}</p>
      <CreatorBadge agent={agent} />
      <Stats agent={agent} />
    </GlassCard>
  );
}
