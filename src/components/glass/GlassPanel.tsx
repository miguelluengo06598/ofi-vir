import type { ElementType, HTMLAttributes, Ref } from "react";

type Props = HTMLAttributes<HTMLElement> & {
  as?: ElementType;
  ref?: Ref<HTMLElement>;
  /** Fuerza el aspecto de hover/activo. */
  strong?: boolean;
};

/** Contenedor de cristal. No anidar más de 2 capas de cristal (backdrop-filter es costoso). */
export function GlassPanel({ as: Tag = "div", strong, className = "", ...rest }: Props) {
  return (
    <Tag
      className={`glass rounded-panel text-white ${strong ? "is-active" : ""} ${className}`}
      {...rest}
    />
  );
}
