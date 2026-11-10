"use client";

import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import { Sparkles, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { defaultScene, scenes } from "@/data/scenes";
import { DEPARTAMENTOS } from "@/content/departamentos";
import { MENU, esActual } from "@/content/navegacion";
import { SECTORES } from "@/content/sectores";
import { useFocusTrap } from "@/lib/useFocusTrap";

const escena = scenes.find((s) => s.id === defaultScene)!;

/** Menú a pantalla completa (móvil y tableta) con la escena de fondo y los enlaces en cascada. */
export function MenuMovil({ ruta, alCerrar }: { ruta: string; alCerrar: () => void }) {
  const caja = useRef<HTMLDivElement>(null);
  const cerrar = useRef<HTMLButtonElement>(null);
  useFocusTrap(caja);

  useEffect(() => {
    cerrar.current?.focus();
    const previo = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && alCerrar();
    window.addEventListener("keydown", tecla);
    return () => {
      document.body.style.overflow = previo;
      window.removeEventListener("keydown", tecla);
    };
  }, [alCerrar]);

  const cascada = (i: number) => ({
    initial: { opacity: 0, y: 18 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] as const, delay: 0.06 + i * 0.05 },
  });
  const sub = "rounded-pill bg-white/10 px-3 py-1.5 text-small ring-1 ring-white/15 aria-[current=page]:bg-white aria-[current=page]:text-black";

  return (
    <motion.div
      ref={caja}
      role="dialog"
      aria-modal="true"
      aria-label="Menú"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.18 } }}
      transition={{ duration: 0.25 }}
      className="fixed inset-0 z-[70] overflow-y-auto bg-black text-white"
    >
      <div aria-hidden="true" className="fixed inset-0">
        <Image src={escena.src} alt="" fill sizes="100vw" className="object-cover" />
        <div className="absolute inset-0 bg-linear-to-b from-black/70 via-black/60 to-black/80" />
      </div>

      <div className="relative mx-auto flex min-h-full max-w-xl flex-col px-5 pt-4 pb-10">
        <div className="flex items-center justify-between">
          <Link href="/" onClick={alCerrar} className="flex items-center gap-2 font-semibold">
            <span aria-hidden="true" className="flex size-8 items-center justify-center rounded-full bg-linear-to-br from-accent to-dept-operaciones">
              <Sparkles size={16} />
            </span>
            Oficina Virtual IA
          </Link>
          <button ref={cerrar} type="button" onClick={alCerrar} aria-label="Cerrar menú" className="flex size-11 items-center justify-center rounded-full bg-white/10 ring-1 ring-white/20">
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        <nav aria-label="Principal" className="mt-10">
          <ul className="flex flex-col gap-1">
            {MENU.map((e, i) => (
              <motion.li key={e.href} {...cascada(i)}>
                <Link
                  href={e.href}
                  onClick={alCerrar}
                  aria-current={esActual(ruta, e.href) ? "page" : undefined}
                  className="block py-2 text-[30px] leading-tight font-semibold tracking-tight text-white/85 aria-[current=page]:text-white"
                >
                  {e.label}
                  {esActual(ruta, e.href) && <span aria-hidden="true" className="ml-3 inline-block size-2 rounded-full bg-[#FFD48A] align-middle" />}
                </Link>
                {e.mega === "departamentos" && (
                  <ul aria-label="Departamentos" className="mt-1 mb-3 flex flex-wrap gap-2">
                    {DEPARTAMENTOS.map((d) => (
                      <li key={d.slug}>
                        <Link href={`/departamentos/${d.slug}`} onClick={alCerrar} aria-current={ruta === `/departamentos/${d.slug}` ? "page" : undefined} className={sub}>
                          {d.nombre}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
                {e.mega === "sectores" && (
                  <ul aria-label="Sectores" className="mt-1 mb-3 flex flex-wrap gap-2">
                    {SECTORES.map((s) => (
                      <li key={s.slug}>
                        <Link href={`/sectores/${s.slug}`} onClick={alCerrar} aria-current={ruta === `/sectores/${s.slug}` ? "page" : undefined} className={sub}>
                          {s.nombre}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </motion.li>
            ))}
          </ul>
        </nav>

        <motion.div {...cascada(MENU.length)} className="mt-auto flex flex-col gap-3 pt-10">
          <Link href="/solicitar-acceso" onClick={alCerrar} className="rounded-pill bg-white px-6 py-3.5 text-center text-body font-semibold text-black">
            Solicitar acceso
          </Link>
          <Link href="/login" onClick={alCerrar} className="rounded-pill px-6 py-3 text-center text-body ring-1 ring-white/30">
            Iniciar sesión
          </Link>
        </motion.div>
      </div>
    </motion.div>
  );
}
