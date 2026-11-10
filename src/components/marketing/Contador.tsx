"use client";

import { animate, useInView } from "framer-motion";
import { useEffect, useLayoutEffect, useRef } from "react";
import { usePreferencias } from "./preferencias";

const formato = (n: number, decimales: number) =>
  n.toLocaleString("es-ES", { useGrouping: "always", minimumFractionDigits: decimales, maximumFractionDigits: decimales } as Intl.NumberFormatOptions);

const useLayoutSeguro = typeof window === "undefined" ? useEffect : useLayoutEffect;

type Props = { valor: number; decimales?: number; prefijo?: string; sufijo?: string; duracion?: number; className?: string };

/**
 * Cuenta de 0 al valor al entrar en pantalla. El HTML del servidor ya trae el valor final (sin JavaScript se
 * ve bien) y una copia invisible del número final reserva el ancho, así que nunca hay salto de diseño.
 * Solo cambia el texto del nodo (sin re-render de React). Con movimiento reducido, muestra el valor final.
 */
export function Contador({ valor, decimales = 0, prefijo = "", sufijo = "", duracion = 1.6, className = "" }: Props) {
  const caja = useRef<HTMLSpanElement>(null);
  const numero = useRef<HTMLSpanElement>(null);
  const visto = useInView(caja, { once: true, margin: "0px 0px -10% 0px" });
  const { reducido } = usePreferencias();
  const final = `${prefijo}${formato(valor, decimales)}${sufijo}`;

  // Antes del primer pintado: a 0, para que no se vea el valor final y luego el 0.
  useLayoutSeguro(() => {
    if (!reducido && !visto && numero.current) numero.current.textContent = `${prefijo}${formato(0, decimales)}${sufijo}`;
  }, [reducido]);

  useEffect(() => {
    const nodo = numero.current;
    if (!nodo) return;
    if (reducido) {
      nodo.textContent = final;
      return;
    }
    if (!visto) return;
    const control = animate(0, valor, {
      duration: duracion,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => (nodo.textContent = `${prefijo}${formato(v, decimales)}${sufijo}`),
    });
    return () => control.stop();
  }, [visto, reducido, valor, decimales, prefijo, sufijo, duracion, final]);

  return (
    <span ref={caja} className={`inline-grid tabular-nums ${className}`}>
      <span aria-hidden="true" className="invisible col-start-1 row-start-1">{final}</span>
      <span ref={numero} aria-hidden="true" className="col-start-1 row-start-1">{final}</span>
      <span className="sr-only">{final}</span>
    </span>
  );
}
