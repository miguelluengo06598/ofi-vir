"use client";

import { animate } from "framer-motion";
import { useEffect, useRef } from "react";
import { usePreferencias } from "./preferencias";

const formato = (n: number, decimales: number) =>
  n.toLocaleString("es-ES", { useGrouping: "always", minimumFractionDigits: decimales, maximumFractionDigits: decimales } as Intl.NumberFormatOptions);

/**
 * Número que se anima del valor anterior al nuevo cada vez que cambia (calculadoras, interruptores).
 * El texto del servidor ya es el valor final; con movimiento reducido cambia sin animar. Para lectores
 * de pantalla, el valor va en una región aparte (sin anunciar cada fotograma). Números tabulares.
 */
export function NumeroAnimado({ valor, decimales = 0, sufijo = "", className = "" }: { valor: number; decimales?: number; sufijo?: string; className?: string }) {
  const nodo = useRef<HTMLSpanElement>(null);
  const previo = useRef(valor);
  const { reducido } = usePreferencias();

  useEffect(() => {
    const el = nodo.current;
    if (!el) return;
    const desde = previo.current;
    previo.current = valor;
    if (reducido || desde === valor) {
      el.textContent = `${formato(valor, decimales)}${sufijo}`;
      return;
    }
    const control = animate(desde, valor, {
      duration: 0.6,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => (el.textContent = `${formato(v, decimales)}${sufijo}`),
    });
    return () => control.stop();
  }, [valor, decimales, sufijo, reducido]);

  return (
    <span className={`tabular-nums ${className}`}>
      <span ref={nodo} aria-hidden="true">{formato(valor, decimales)}{sufijo}</span>
      <span className="sr-only">{formato(valor, decimales)}{sufijo}</span>
    </span>
  );
}
