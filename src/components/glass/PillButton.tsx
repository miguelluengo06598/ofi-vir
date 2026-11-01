import type { ButtonHTMLAttributes } from "react";
import type { LucideIcon } from "lucide-react";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  icon?: LucideIcon;
  active?: boolean;
  /** Estado activo en blanco sólido (navegación). */
  solid?: boolean;
  /** Fuerza el aspecto de hover (para revisión visual). */
  hovered?: boolean;
};

export function PillButton({
  icon: Icon,
  active,
  solid,
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
      className={`glass glass-interactive inline-flex cursor-pointer items-center gap-2 rounded-pill text-small ${children ? "px-4 py-2" : "size-10 shrink-0 justify-center"} text-white disabled:cursor-not-allowed disabled:opacity-50 ${
        active
          ? solid
            ? "is-active border-white bg-white! text-black!"
            : "is-active border-accent/60 bg-accent/30!"
          : ""
      } ${hovered ? "is-hover" : ""} ${className}`}
      {...rest}
    >
      {Icon && <Icon size={16} aria-hidden="true" className="shrink-0" />}
      {children}
    </button>
  );
}
