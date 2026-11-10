import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { vecinos } from "@/content/navegacion";

/** Anterior y siguiente del recorrido: la web se lee como una historia (src/content/navegacion.ts). */
export function Recorrido({ ruta }: { ruta: string }) {
  const { anterior, siguiente } = vecinos(ruta);
  if (!anterior && !siguiente) return null;
  const tarjeta = "glass glass-interactive flex flex-1 items-center gap-3 rounded-card p-4 sm:p-5";
  return (
    <nav aria-label="Recorrido de la web" className="mx-auto flex w-full max-w-7xl flex-col gap-3 px-4 pt-6 pb-4 sm:flex-row">
      {anterior ? (
        <Link href={anterior.href} rel="prev" className={tarjeta}>
          <ArrowLeft size={20} aria-hidden="true" className="shrink-0" />
          <span>
            <span className="block text-tiny text-ink-2">Anterior</span>
            <span className="block text-body font-semibold">{anterior.label}</span>
          </span>
        </Link>
      ) : (
        <span className="flex-1" />
      )}
      {siguiente && (
        <Link href={siguiente.href} rel="next" className={`${tarjeta} justify-end text-right`}>
          <span>
            <span className="block text-tiny text-ink-2">Siguiente</span>
            <span className="block text-body font-semibold">{siguiente.label}</span>
          </span>
          <ArrowRight size={20} aria-hidden="true" className="shrink-0" />
        </Link>
      )}
    </nav>
  );
}
