import { Coins, ShieldCheck } from "lucide-react";
import { Avatar, GlassCard, StatusBadge, statusMeta, type AgentStatus } from "@/components/glass";
import type { DepartmentSummary, StatusFilter } from "@/data/departments";

const statusOrder = Object.keys(statusMeta) as AgentStatus[];

export function DepartmentCard({
  summary,
  filter,
  delay,
}: {
  summary: DepartmentSummary;
  filter: StatusFilter;
  delay: number;
}) {
  const { id, agents, pendingApprovals, creditsToday } = summary;
  const lead = agents[0];
  const counts = statusOrder
    .map((status) => ({ status, count: agents.filter((a) => a.status === status).length }))
    .filter((s) => s.count > 0);

  return (
    <GlassCard
      department={id}
      delay={delay}
      description={`${lead.name.split(" ")[0]} está ${lead.task}`}
      footer={
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck size={14} aria-hidden="true" />
            {pendingApprovals} {pendingApprovals === 1 ? "aprobación" : "aprobaciones"}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Coins size={14} aria-hidden="true" />
            {creditsToday.toLocaleString("es-ES")} créditos hoy
          </span>
        </div>
      }
    >
      <ul aria-label="Agentes" className="flex -space-x-2">
        {agents.map((a) => (
          <li
            key={a.id}
            title={`${a.name} · ${a.role}`}
            className={`transition-opacity ${filter !== "all" && a.status !== filter ? "opacity-35" : ""}`}
          >
            <Avatar name={a.name} tone={id} status={a.status} />
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {counts.map(({ status, count }) => (
          <StatusBadge key={status} status={status} count={count} />
        ))}
      </div>
    </GlassCard>
  );
}
