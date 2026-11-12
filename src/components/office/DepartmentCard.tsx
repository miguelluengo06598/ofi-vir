import { Coins, ShieldCheck } from "lucide-react";
import { Avatar, GlassCard, StatusBadge, statusMeta, type AgentStatus } from "@/components/glass";
import { useApprovals } from "@/components/ApprovalsProvider";
import { useSimulation } from "@/components/SimulationProvider";
import type { DepartmentSummary, StatusFilter } from "@/data/departments";

const statusOrder = Object.keys(statusMeta) as AgentStatus[];

export function DepartmentCard({
  summary,
  filter,
  delay,
  onOpen,
}: {
  summary: DepartmentSummary;
  filter: StatusFilter;
  delay: number;
  onOpen: () => void;
}) {
  const { id, agents, pendingApprovals, creditsToday } = summary;
  const { arrival } = useApprovals();
  const { latest } = useSimulation();
  const pulse = latest && latest.handoff.toDepartmentId === id ? latest.seq : 0;
  const lead = agents[0] as (typeof agents)[number] | undefined;
  const counts = statusOrder
    .map((status) => {
      const members = agents.filter((a) => a.status === status);
      // Con el experto: el menor tiempo estimado de respuesta entre sus agentes.
      const hours = members.flatMap((a) => (a.consultation ? [a.consultation.estimatedHours] : []));
      return { status, count: members.length, detail: hours.length ? `respuesta en ~${Math.min(...hours)} h` : undefined };
    })
    .filter((s) => s.count > 0);

  return (
    <GlassCard
      department={id}
      delay={delay}
      layoutId={`dept-${id}`}
      cardId={id}
      pulse={pulse}
      onOpen={onOpen}
      description={lead ? `${lead.name.split(" ")[0]} está ${lead.currentTask}` : "Todavía no hay agentes en este departamento"}
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
            data-agent-id={a.id}
            title={`${a.name} · ${a.role}`}
            className={`transition-opacity ${a.id === arrival ? "opacity-0" : filter !== "all" && a.status !== filter ? "opacity-35" : ""}`}
          >
            <Avatar name={a.name} tone={id} status={a.status} />
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {counts.map(({ status, count, detail }) => (
          <StatusBadge key={status} status={status} count={count} detail={detail} />
        ))}
      </div>
    </GlassCard>
  );
}
