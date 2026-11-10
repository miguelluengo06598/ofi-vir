import type { Revisar } from "@/content/departamentos";

/**
 * Marca de contenido por revisar (`revisar` en src/content/departamentos.ts). Solo fuera de producción:
 * es una nota para quien redacta, no para el visitante.
 */
export function PorRevisar({ revisar, className = "" }: Revisar & { className?: string }) {
  if (!revisar || process.env.NODE_ENV === "production") return null;
  return (
    <span
      title={revisar}
      className={`inline-flex max-w-full items-start gap-1 rounded-[10px] bg-status-waiting/20 px-2 py-1 text-left text-tiny leading-snug text-status-waiting ring-1 ring-status-waiting/45 [text-shadow:none] ${className}`}
    >
      <span className="font-semibold">Por revisar:</span> <span className="text-white/85">{revisar}</span>
    </span>
  );
}
