import type { ButtonHTMLAttributes } from "react";
import type { LucideIcon } from "lucide-react";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  icon?: LucideIcon;
  active?: boolean;
  /** Fuerza el aspecto de hover (para revisión visual). */
  hovered?: boolean;
};

export function PillButton({
  icon: Icon,
  active,
  hovered,
  className = "",
  children,
  type = "button",
  ...rest
}: Props) {
  return (
    <button
      type={type}
      aria-pressed={active}
      className={`glass glass-interactive inline-flex cursor-pointer items-center gap-2 rounded-pill px-4 py-2 text-small text-white disabled:cursor-not-allowed disabled:opacity-50 ${
        active ? "is-active border-accent/60 bg-accent/30!" : ""
      } ${hovered ? "is-hover" : ""} ${className}`}
      {...rest}
    >
      {Icon && <Icon size={16} aria-hidden="true" />}
      {children}
    </button>
  );
}
