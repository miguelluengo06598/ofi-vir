import { statusMeta, type AgentStatus } from "./tokens";

type Props = { status: AgentStatus; count?: number; className?: string };

export function StatusBadge({ status, count, className = "" }: Props) {
  const { label, dot } = statusMeta[status];
  return (
    <span className={`inline-flex items-center gap-1.5 text-tiny text-ink-2 ${className}`}>
      <span aria-hidden="true" className={`size-2 rounded-full ${dot}`} />
      {count !== undefined && <span className="font-semibold text-white">{count}</span>}
      {label}
    </span>
  );
}
