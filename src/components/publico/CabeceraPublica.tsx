"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion, useMotionValueEvent, useScroll } from "framer-motion";
import { ChevronDown, Menu } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { MENU, esActual } from "@/content/navegacion";
import { useMovimientoReducido } from "@/components/marketing/preferencias";
import { MegaMenu } from "./navegacion/MegaMenu";
import { MenuMovil } from "./navegacion/MenuMovil";

type Mega = "departamentos" | "sectores";

/** Píldora bajo el enlace de la página actual: se desliza de un enlace a otro (solo transform). */
function Indicador({ reducido }: { reducido: boolean }) {
  return (
    <motion.span
      layoutId={reducido ? undefined : "nav-actual"}
      aria-hidden="true"
      className="absolute inset-0 -z-10 rounded-pill bg-white/15"
      transition={{ type: "spring", stiffness: 420, damping: 36 }}
    />
  );
}

/**
 * Cabecera fija de cristal. Escritorio (≥ 1280 px): menú completo con mega menús en Departamentos y
 * Sectores (se abren al pasar el ratón o al pulsar; Escape los cierra). Al bajar se compacta (solo
 * transform). Por debajo de 1280 px, menú a pantalla completa. Marca la página actual (y sus subpáginas).
 */
export function CabeceraPublica() {
  const ruta = usePathname();
  const reducido = useMovimientoReducido();
  const [abierto, setAbierto] = useState<Mega | null>(null);
  const [movil, setMovil] = useState(false);
  const [compacta, setCompacta] = useState(false);
  const [rutaVista, setRutaVista] = useState(ruta);
  const zona = useRef<HTMLDivElement>(null);
  const espera = useRef<ReturnType<typeof setTimeout>>(undefined);
  const disparadores = useRef<Partial<Record<Mega, HTMLButtonElement | null>>>({});
  const idBase = useId();
  const { scrollY } = useScroll();

  useMotionValueEvent(scrollY, "change", (y) => setCompacta(y > 24));

  // Al navegar se cierra todo (ajuste durante el render, sin efecto).
  if (rutaVista !== ruta) {
    setRutaVista(ruta);
    setAbierto(null);
    setMovil(false);
  }

  const cerrarMega = useCallback(() => setAbierto(null), []);
  const cerrarMovil = useCallback(() => setMovil(false), []);

  useEffect(() => {
    if (!abierto) return;
    const tecla = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      disparadores.current[abierto]?.focus();
      setAbierto(null);
    };
    const fuera = (e: PointerEvent) => !zona.current?.contains(e.target as Node) && setAbierto(null);
    window.addEventListener("keydown", tecla);
    window.addEventListener("pointerdown", fuera);
    return () => {
      window.removeEventListener("keydown", tecla);
      window.removeEventListener("pointerdown", fuera);
    };
  }, [abierto]);

  // Ratón: abrir con un pequeño retraso y cerrar al salir de la cabecera y del panel.
  const programar = (siguiente: Mega | null, ms: number) => {
    clearTimeout(espera.current);
    espera.current = setTimeout(() => setAbierto(siguiente), ms);
  };

  const enlace =
    "relative rounded-pill px-3 py-2 text-small whitespace-nowrap text-ink-2 transition-colors hover:text-white aria-[current=page]:text-white";
  return (
    <header className="fixed inset-x-0 top-0 z-50 px-3 pt-3 sm:px-4">
      <div ref={zona} onPointerLeave={(e) => e.pointerType === "mouse" && abierto && programar(null, 220)} onPointerEnter={() => clearTimeout(espera.current)}>
        <motion.div
          animate={{ scale: compacta ? 0.975 : 1, y: compacta ? -4 : 0 }}
          transition={{ duration: reducido ? 0 : 0.25, ease: "easeOut" }}
          className={`glass mx-auto flex max-w-7xl items-center gap-2 rounded-pill py-2 pr-2 pl-4 ${compacta ? "is-active" : ""}`}
        >
          <Link href="/" className="flex shrink-0 items-center gap-2 rounded-pill text-small font-semibold whitespace-nowrap sm:text-body">
            {/* eslint-disable-next-line @next/next/no-img-element -- SVG estático de la marca */}
            <img src="/marca.svg" alt="" aria-hidden="true" width={28} height={28} className="size-7" />
            MyOfia
          </Link>

          <nav aria-label="Principal" className="mx-auto hidden xl:block">
            <ul className="flex items-center gap-0.5">
              {MENU.map((e) => {
                const actual = esActual(ruta, e.href);
                if (!e.mega) {
                  return (
                    <li key={e.href}>
                      <Link href={e.href} aria-current={actual ? "page" : undefined} className={enlace}>
                        {actual && <Indicador reducido={reducido} />}
                        {e.label}
                      </Link>
                    </li>
                  );
                }
                const mega = e.mega;
                const panelId = `${idBase}-${mega}`;
                return (
                  <li key={e.href}>
                    <button
                      ref={(b) => {
                        disparadores.current[mega] = b;
                      }}
                      type="button"
                      aria-expanded={abierto === mega}
                      aria-controls={panelId}
                      aria-current={actual ? "page" : undefined}
                      onClick={() => setAbierto((a) => (a === mega ? null : mega))}
                      onPointerEnter={(ev) => ev.pointerType === "mouse" && programar(mega, abierto ? 0 : 120)}
                      className={`${enlace} inline-flex items-center gap-1 ${abierto === mega ? "text-white" : ""}`}
                    >
                      {actual && <Indicador reducido={reducido} />}
                      {e.label}
                      <ChevronDown size={14} aria-hidden="true" className={`transition-transform duration-200 motion-reduce:transition-none ${abierto === mega ? "rotate-180" : ""}`} />
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>

          <div className="ml-auto flex shrink-0 items-center gap-1.5 xl:ml-0">
            <Link href="/login" className="hidden rounded-pill px-3 py-2 text-small whitespace-nowrap text-ink-2 hover:text-white sm:inline-flex">
              Iniciar sesión
            </Link>
            <span className="hidden sm:block">
              <Link href="/solicitar-acceso" className="inline-flex items-center rounded-pill bg-white px-4 py-2 text-small font-semibold whitespace-nowrap text-black hover:bg-white/90">
                Solicitar acceso
              </Link>
            </span>
            <button
              type="button"
              onClick={() => setMovil(true)}
              aria-label="Abrir menú"
              aria-expanded={movil}
              className="flex size-10 items-center justify-center rounded-full hover:bg-white/10 xl:hidden"
            >
              <Menu size={20} aria-hidden="true" />
            </button>
          </div>
        </motion.div>

        <AnimatePresence>
          {abierto && (
            <div className="hidden xl:block" key={abierto}>
              <MegaMenu tipo={abierto} id={`${idBase}-${abierto}`} ruta={ruta} alCerrar={cerrarMega} />
            </div>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>{movil && <MenuMovil ruta={ruta} alCerrar={cerrarMovil} />}</AnimatePresence>
    </header>
  );
}
