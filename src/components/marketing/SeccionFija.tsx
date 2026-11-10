"use client";

import { AnimatePresence, motion, useMotionValueEvent, useScroll } from "framer-motion";
import { useRef, useState, type ReactNode } from "react";
import { GlassPanel } from "@/components/glass";
import { usePreferencias } from "./preferencias";
import { tipo } from "./tipografia";

export type PasoFijo = {
  titulo: string;
  /** Texto del paso: también va en la lista para lectores de pantalla. */
  texto: ReactNode;
  visual?: ReactNode;
  /** Contenido solo para el panel visible (p. ej. un vídeo pequeño); no se repite en la lista oculta. */
  extra?: ReactNode;
};

type Props = {
  pasos: PasoFijo[];
  /** Etiqueta del conjunto para lectores de pantalla (p. ej. «Cómo funciona»). */
  etiqueta: string;
  /** Altura de scroll que dura cada paso, en vh. */
  vhPorPaso?: number;
  /** Alto reservado para el visual, para que cambiar de paso no mueva nada. */
  altoVisual?: string;
  /**
   * Visual único que NO se desmonta al cambiar de paso (p. ej. una réplica de la interfaz que va resaltando
   * partes): recibe el paso activo. Sustituye a los `visual` de cada paso.
   */
  visualFijo?: (activo: number) => ReactNode;
  /** Más ancho para el visual (2/3 del panel en escritorio). */
  amplio?: boolean;
};

/**
 * «Scrollytelling»: un panel se queda fijo mientras se baja y su contenido cambia según el avance,
 * con indicador de progreso. Los pasos se ven completos en una lista de verdad para lectores de pantalla
 * y, con movimiento reducido, la sección entera se convierte en una lista normal (sin fijar nada).
 */
export function SeccionFija({ pasos, etiqueta, vhPorPaso = 90, altoVisual = "clamp(12rem, 32vh, 20rem)", visualFijo, amplio }: Props) {
  const { reducido } = usePreferencias();
  const zona = useRef<HTMLDivElement>(null);
  const [activo, setActivo] = useState(0);
  const { scrollYProgress } = useScroll({ target: zona, offset: ["start start", "end end"] });
  const n = pasos.length;

  useMotionValueEvent(scrollYProgress, "change", (v) => {
    const i = Math.min(n - 1, Math.max(0, Math.floor(v * n)));
    setActivo((a) => (a === i ? a : i));
  });

  if (reducido) {
    return (
      <div className="grid gap-4">
      {visualFijo && <div style={{ height: altoVisual }}>{visualFijo(-1)}</div>}
      <ol aria-label={etiqueta} className="grid gap-4">
        {pasos.map((p, i) => (
          <GlassPanel as="li" key={p.titulo} className="grid gap-6 p-6 sm:p-8 md:grid-cols-2 md:items-center">
            <div>
              <p className={tipo.antetitulo}>Paso {i + 1} de {n}</p>
              <h3 className={`mt-2 ${tipo.subtitular}`}>{p.titulo}</h3>
              <div className={`mt-3 ${tipo.cuerpo}`}>{p.texto}</div>
              {p.extra && <div className="mt-4">{p.extra}</div>}
            </div>
            {p.visual && <div>{p.visual}</div>}
          </GlassPanel>
        ))}
      </ol>
      </div>
    );
  }

  const paso = pasos[activo];
  return (
    <div ref={zona} style={{ height: `${n * vhPorPaso}vh` }} className="relative">
      {/* Para lectores de pantalla: todos los pasos, en orden y sin depender del scroll. */}
      <ol aria-label={etiqueta} className="sr-only">
        {pasos.map((p) => (
          <li key={p.titulo}>
            <h3>{p.titulo}</h3>
            <div>{p.texto}</div>
          </li>
        ))}
      </ol>

      <div aria-hidden="true" className="sticky top-0 flex h-svh items-center pt-20 pb-6">
        <GlassPanel className={`grid w-full gap-6 p-6 sm:p-10 md:items-center md:gap-10 ${amplio ? "md:grid-cols-[auto_minmax(0,0.85fr)_minmax(0,1.9fr)] md:p-6 lg:p-8" : "md:grid-cols-[auto_1fr_1fr]"}`}>
          {/* Indicador: puntos por paso y barra que se llena con el scroll. */}
          <div className="flex items-center gap-3 md:h-full md:flex-col md:justify-center">
            <div className="relative h-1 w-24 overflow-hidden rounded-full bg-white/15 md:hidden">
              <motion.div className="absolute inset-0 origin-left rounded-full bg-white" style={{ scaleX: scrollYProgress }} />
            </div>
            <div className="relative hidden h-40 w-1 overflow-hidden rounded-full bg-white/15 md:block">
              <motion.div className="absolute inset-0 origin-top rounded-full bg-white" style={{ scaleY: scrollYProgress }} />
            </div>
            <p className="text-small tabular-nums text-ink-2">{activo + 1} / {n}</p>
          </div>

          <div className="min-h-[12rem]">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={activo}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -16 }}
                transition={{ duration: 0.35, ease: "easeOut" }}
              >
                <p className={tipo.antetitulo}>Paso {activo + 1}</p>
                <h3 className={`mt-2 ${tipo.subtitular}`}>{paso.titulo}</h3>
                <div className={`mt-3 ${tipo.cuerpo}`}>{paso.texto}</div>
                {paso.extra && <div className="mt-4">{paso.extra}</div>}
              </motion.div>
            </AnimatePresence>
          </div>

          <div className="relative" style={{ height: altoVisual }}>
            {visualFijo ? visualFijo(activo) : (
            <AnimatePresence initial={false}>
              {paso.visual && (
                <motion.div
                  key={activo}
                  className="absolute inset-0"
                  initial={{ opacity: 0, scale: 0.97 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 1.02 }}
                  transition={{ duration: 0.45, ease: "easeOut" }}
                >
                  {paso.visual}
                </motion.div>
              )}
            </AnimatePresence>
            )}
          </div>
        </GlassPanel>
      </div>
    </div>
  );
}
