"use client";

import { motion } from "framer-motion";
import type { ReactNode } from "react";

type Props = { children: ReactNode; retraso?: number; className?: string; as?: "div" | "li" };

/**
 * Entrada suave al aparecer en pantalla: 12 px de desplazamiento (300 ms, ease-out), una sola vez.
 * Solo anima transform (sin opacity ni filter) para no romper el desenfoque del cristal que envuelve.
 * MotionProvider aplica prefers-reduced-motion.
 */
export function Aparecer({ children, retraso = 0, className, as = "div" }: Props) {
  const Etiqueta = as === "li" ? motion.li : motion.div;
  return (
    <Etiqueta
      className={className}
      initial={{ y: 12 }}
      whileInView={{ y: 0 }}
      viewport={{ once: true, margin: "0px 0px -60px 0px" }}
      transition={{ duration: 0.3, ease: "easeOut", delay: retraso }}
    >
      {children}
    </Etiqueta>
  );
}
