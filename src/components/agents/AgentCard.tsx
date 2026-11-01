import { Avatar, GlassCard, StatusBadge } from "@/components/glass";
import { Rating } from "@/components/marketplace/parts";
import type { OfficeAgent } from "@/data/departments";
import { getAgentStats } from "@/data/agentStats";
import { fmtNumber } from "@/lib/format";

type Props = { agent: OfficeAgent; delay: number; onOpen: () => void };

export function AgentCard({ agent, delay, onOpen }: Props) {
  const stats = getAgentStats(agent.id);
  return (
    <GlassCard
      department={agent.departmentId}
      delay={delay}
      layoutId={`agent-${agent.id}`}
      onOpen={onOpen}
      className="h-full"
    >
      <div className="flex items-center gap-3">
        <Avatar name={agent.name} tone={agent.departmentId} size={48} />
        <div className="min-w-0">
          <p className="text-body font-semibold">{agent.name}</p>
          <p className="text-small text-ink-2">{agent.role}</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <StatusBadge status={agent.status} />
        <p className="text-tiny text-ink-3">Creador: {agent.creator}</p>
      </div>
      <dl className="mt-auto grid grid-cols-3 gap-2 border-t border-glass-border pt-3 text-center">
        <div>
          <dd className="text-body font-semibold">{stats.tasksWeek}</dd>
          <dt className="text-tiny text-ink-2">Tareas esta semana</dt>
        </div>
        <div>
          <dd className="text-body font-semibold">
            {stats.rating === null ? "—" : <Rating value={stats.rating} />}
          </dd>
          <dt className="text-tiny text-ink-2">Valoración</dt>
        </div>
        <div>
          <dd className="text-body font-semibold">{fmtNumber(stats.creditsMonth)}</dd>
          <dt className="text-tiny text-ink-2">Créditos este mes</dt>
        </div>
      </dl>
    </GlassCard>
  );
}
