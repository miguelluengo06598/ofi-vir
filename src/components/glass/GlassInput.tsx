import type { InputHTMLAttributes } from "react";
import type { LucideIcon } from "lucide-react";

type Props = InputHTMLAttributes<HTMLInputElement> & { icon?: LucideIcon };

/** Campo de texto en píldora de cristal. Pasar siempre `aria-label` o un `<label>` asociado. */
export function GlassInput({ icon: Icon, className = "", ...rest }: Props) {
  return (
    <label
      className={`glass flex items-center gap-2 rounded-pill px-4 py-2 text-small text-white focus-within:[--glass-fill:var(--glass-bg-strong)] focus-within:outline-2 focus-within:outline-white ${className}`}
    >
      {Icon && <Icon size={16} aria-hidden="true" className="shrink-0 text-ink-2" />}
      <input
        className="min-w-0 flex-1 bg-transparent text-white outline-none placeholder:text-ink-3"
        {...rest}
      />
    </label>
  );
}
