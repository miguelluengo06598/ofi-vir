import type { ReactNode } from "react";
import { Aparecer } from "./Aparecer";

type Props = {
  id?: string;
  antetitulo?: string;
  titulo: string;
  intro?: ReactNode;
  children: ReactNode;
  className?: string;
};

/** Bloque de página con su título (h2) enlazado por aria-labelledby. */
export function Seccion({ id, antetitulo, titulo, intro, children, className = "" }: Props) {
  const tituloId = `${id ?? titulo.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-titulo`;
  return (
    <section id={id} aria-labelledby={tituloId} className={`mx-auto w-full max-w-6xl scroll-mt-24 px-4 py-14 sm:py-20 ${className}`}>
      <Aparecer className="mb-8 max-w-2xl sm:mb-10">
        {antetitulo && <p className="mb-2 text-small font-semibold tracking-wide text-ink-2 uppercase">{antetitulo}</p>}
        <h2 id={tituloId} className="text-[26px] leading-tight font-semibold text-balance [text-shadow:0_1px_10px_rgba(0,0,0,0.6)] sm:text-[34px]">
          {titulo}
        </h2>
        {intro && <div className="mt-3 text-body text-ink-2 [text-shadow:0_1px_8px_rgba(0,0,0,0.6)] sm:text-[17px]">{intro}</div>}
      </Aparecer>
      {children}
    </section>
  );
}
