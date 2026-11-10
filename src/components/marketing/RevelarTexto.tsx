"use client";

import { motion, useInView } from "framer-motion";
import { Fragment, useRef, type ElementType } from "react";
import { usePreferencias } from "./preferencias";

type Props = {
  /** Texto a revelar. Con `por="lineas"`, cada elemento del array es una línea. */
  texto: string | string[];
  por?: "palabras" | "lineas";
  as?: ElementType;
  className?: string;
  /** Retraso inicial (s) y separación entre piezas (s). */
  retraso?: number;
  escalon?: number;
};

/**
 * Revela un texto por palabras o por líneas al entrar en pantalla: cada pieza sube desde detrás de una
 * máscara (overflow hidden) y aparece. Solo anima transform y opacity, y el texto ocupa su sitio desde
 * el principio (sin saltos). Los lectores de pantalla leen la frase entera una sola vez.
 */
export function RevelarTexto({ texto, por = "palabras", as: Etiqueta = "p", className = "", retraso = 0, escalon }: Props) {
  const ref = useRef<HTMLElement>(null);
  const visto = useInView(ref, { once: true, margin: "0px 0px -12% 0px" });
  const { reducido } = usePreferencias();
  const completo = Array.isArray(texto) ? texto.join(" ") : texto;

  if (reducido) return <Etiqueta className={className}>{completo}</Etiqueta>;

  const piezas = por === "lineas" ? (Array.isArray(texto) ? texto : [texto]) : completo.split(/\s+/);
  const paso = escalon ?? (por === "lineas" ? 0.12 : 0.045);

  return (
    <Etiqueta ref={ref} className={className}>
      <span className="sr-only">{completo}</span>
      {piezas.map((p, i) => (
        <Fragment key={i}>
        <span aria-hidden="true" className={`${por === "lineas" ? "block" : "inline-block"} overflow-hidden pb-[0.12em] -mb-[0.12em] align-top`}>
          <motion.span
            className="inline-block will-change-transform"
            initial={{ y: "105%", opacity: 0 }}
            animate={visto ? { y: "0%", opacity: 1 } : undefined}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1], delay: retraso + i * paso }}
          >
            {p}
          </motion.span>
        </span>
        {por === "palabras" && i < piezas.length - 1 && " "}
        </Fragment>
      ))}
    </Etiqueta>
  );
}
