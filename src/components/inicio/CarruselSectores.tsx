"use client";

import Link from "next/link";
import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useMovimientoReducido } from "@/components/marketing/preferencias";
import { SECTORES } from "@/content/sectores";

/**
 * Carrusel de sectores: una fila con desplazamiento horizontal (táctil, rueda y teclado: cada tarjeta es
 * un enlace) y botones anterior/siguiente. Sin autoplay. Encaja por tarjetas (scroll-snap).
 */
export function CarruselSectores() {
  const pista = useRef<HTMLUListElement>(null);
  const reducido = useMovimientoReducido();
  const [extremos, setExtremos] = useState({ inicio: true, fin: false });

  useEffect(() => {
    const el = pista.current;
    if (!el) return;
    const medir = () => setExtremos({ inicio: el.scrollLeft < 8, fin: el.scrollLeft + el.clientWidth > el.scrollWidth - 8 });
    medir();
    el.addEventListener("scroll", medir, { passive: true });
    const obs = new ResizeObserver(medir);
    obs.observe(el);
    return () => {
      el.removeEventListener("scroll", medir);
      obs.disconnect();
    };
  }, []);

  const mover = (dir: 1 | -1) => {
    const el = pista.current;
    if (!el) return;
    const tarjeta = el.querySelector("li")?.getBoundingClientRect().width ?? 300;
    el.scrollBy({ left: dir * (tarjeta + 16), behavior: reducido ? "auto" : "smooth" });
  };

  const boton = "flex size-11 items-center justify-center rounded-full bg-white/10 ring-1 ring-white/25 hover:bg-white/15 disabled:opacity-35";
  return (
    <div>
      <ul
        ref={pista}
        aria-label="Sectores"
        className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-px-4 px-4 pb-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {SECTORES.map((s) => {
          const Icono = s.icono;
          return (
            <li key={s.slug} className="w-[80%] shrink-0 snap-start sm:w-[46%] lg:w-[31%]">
              <Link href={`/sectores/${s.slug}`} className="glass glass-interactive group flex h-full flex-col gap-4 rounded-card p-6 text-white">
                <span className="flex items-center gap-3">
                  <span className="flex size-10 items-center justify-center rounded-full bg-white/10 ring-1 ring-white/15">
                    <Icono size={19} aria-hidden="true" />
                  </span>
                  <span className="text-h2">{s.nombre}</span>
                </span>
                <span className="text-body text-white/90">«{s.ejemplo}»</span>
                <span className="mt-auto inline-flex items-center gap-1.5 text-small font-semibold">
                  Ver {s.nombre.toLowerCase()} <ArrowRight size={15} aria-hidden="true" className="transition-transform group-hover:translate-x-0.5" />
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      <div className="mt-2 flex justify-end gap-2">
        <button type="button" className={boton} onClick={() => mover(-1)} disabled={extremos.inicio} aria-label="Sectores anteriores">
          <ChevronLeft size={18} aria-hidden="true" />
        </button>
        <button type="button" className={boton} onClick={() => mover(1)} disabled={extremos.fin} aria-label="Más sectores">
          <ChevronRight size={18} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
