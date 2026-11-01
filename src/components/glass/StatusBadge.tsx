import { statusMeta, type AgentStatus } from "./tokens";

export function StatusBadge({ status, className = "" }: { status: AgentStatus; className?: string }) {
  const { label, dot } = statusMeta[status];
  return (
    <span className={`inline-flex items-center gap-1.5 text-tiny text-ink-2 ${className}`}>
      <span aria-hidden="true" className={`size-2 rounded-full ${dot}`} />
      {label}
    </span>
  );
}
