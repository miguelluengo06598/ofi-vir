import Link from "next/link";
import type { ComponentProps } from "react";

type Props = ComponentProps<typeof Link> & { variante?: "principal" | "cristal"; grande?: boolean };

/** Enlace con forma de píldora. «principal»: blanco sólido; «cristal»: el cristal de la oficina. */
export function EnlacePildora({ variante = "principal", grande, className = "", ...rest }: Props) {
  const tam = grande ? "px-6 py-3 text-body" : "px-4 py-2 text-small";
  const estilo =
    variante === "principal"
      ? "bg-white font-semibold text-black hover:bg-white/90"
      : "glass glass-interactive text-white";
  return (
    <Link
      className={`inline-flex items-center justify-center gap-2 rounded-pill transition-colors ${tam} ${estilo} ${className}`}
      {...rest}
    />
  );
}
