import { ChevronDown } from "lucide-react";
import { GlassPanel } from "@/components/glass";

/**
 * Acordeón con <details>/<summary>: funciona sin JavaScript, con teclado (Intro/Espacio)
 * y los lectores de pantalla anuncian si está abierto o cerrado.
 */
export function PreguntasFrecuentes({ preguntas }: { preguntas: readonly { p: string; r: string }[] }) {
  return (
    <GlassPanel className="divide-y divide-white/15 px-2 sm:px-4">
      {preguntas.map(({ p, r }) => (
        <details key={p} className="group">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-card px-3 py-4 text-body font-semibold [&::-webkit-details-marker]:hidden">
            {p}
            <ChevronDown size={18} aria-hidden="true" className="shrink-0 transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none" />
          </summary>
          <p className="px-3 pb-5 text-body text-ink-2">{r}</p>
        </details>
      ))}
    </GlassPanel>
  );
}
