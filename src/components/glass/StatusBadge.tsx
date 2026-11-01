import { statusMeta, type AgentStatus } from "./tokens";

type Props = {
  status: AgentStatus;
  count?: number;
  /** Texto adicional tras el estado (p. ej. «respuesta en ~4 h»). */
  detail?: string;
  className?: string;
};

export function StatusBadge({ status, count, detail, className = "" }: Props) {
  const { label, dot } = statusMeta[status];
  return (
    <span className={`inline-flex items-center gap-1.5 text-tiny text-ink-2 ${className}`}>
      <span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${dot}`} />
      {count !== undefined && <span className="font-semibold text-white">{count}</span>}
      {label}
      {detail && <span className="text-ink-3">· {detail}</span>}
    </span>
  );
}
