import { departmentMeta, statusMeta, type AgentStatus, type DepartmentId } from "./tokens";

type Props = {
  name: string;
  tone?: DepartmentId;
  size?: number;
  /** Punto de estado opcional (el texto lo aporta el aria-label). */
  status?: AgentStatus;
  /** Sustituye al texto del estado en el aria-label (p. ej. «En línea»). */
  statusLabel?: string;
  className?: string;
};

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

export function Avatar({ name, tone = "ventas", size = 40, status, statusLabel, className = "" }: Props) {
  const label = status ? `${name}, ${statusLabel ?? statusMeta[status].label}` : name;
  return (
    <span
      role="img"
      aria-label={label}
      style={{ width: size, height: size, fontSize: size * 0.38 }}
      className={`relative inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white ${departmentMeta[tone].avatar} ${className}`}
    >
      {initials(name)}
      {status && (
        <span
          aria-hidden="true"
          className={`absolute right-0 bottom-0 size-[28%] rounded-full ring-2 ring-black/40 ${statusMeta[status].dot}`}
        />
      )}
    </span>
  );
}
