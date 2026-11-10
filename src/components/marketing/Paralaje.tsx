"use client";

import { motion, useScroll, useTransform } from "framer-motion";
import { useRef, type ReactNode } from "react";
import { usePreferencias } from "./preferencias";

/**
 * Desplaza su contenido un poco más despacio (o más deprisa) que la página mientras cruza la pantalla.
 * `intensidad` en píxeles: positiva = se queda atrás (lejos), negativa = se adelanta (cerca).
 * Solo transform; el hueco del contenido no cambia. Sin paralaje con movimiento reducido.
 * Funciona con cristal dentro: un transform en el padre no rompe el backdrop-filter.
 */
export function Paralaje({ children, intensidad = 40, className = "" }: { children: ReactNode; intensidad?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const { reducido } = usePreferencias();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const y = useTransform(scrollYProgress, [0, 1], [intensidad, -intensidad]);

  return (
    <div ref={ref} className={className}>
      <motion.div style={reducido ? undefined : { y }} className={reducido ? undefined : "will-change-transform"}>
        {children}
      </motion.div>
    </div>
  );
}
