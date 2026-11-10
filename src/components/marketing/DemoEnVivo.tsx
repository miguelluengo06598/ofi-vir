"use client";

import { useInView } from "framer-motion";
import { Suspense, lazy, useRef, type ComponentType, type LazyExoticComponent, type ReactNode } from "react";

type Props = {
  /** Componente real de la oficina creado con demoDiferida(() => import("…")) a nivel de módulo. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- cada demo tiene sus propias props
  componente: LazyExoticComponent<ComponentType<any>>;
  /** Props para la demo (p. ej. el paso activo de un recorrido). */
  props?: Record<string, unknown>;
  /** Hueco que ocupa mientras carga (mismo alto que la demo, para que no haya saltos). */
  reserva: ReactNode;
  /** Qué muestra la demo, para lectores de pantalla. */
  descripcion: string;
  /** Etiqueta visible que avisa de que los datos son simulados. */
  etiqueta?: string;
  className?: string;
};

/**
 * Prepara una demo para DemoEnVivo. Llamarla a nivel de módulo (fuera de cualquier componente):
 *   const DemoOficina = demoDiferida(() => import("@/components/publico/DemoOficina"));
 * El import() solo se ejecuta cuando DemoEnVivo la pinta por primera vez.
 */
export const demoDiferida = <P extends object>(cargar: () => Promise<{ default: ComponentType<P> }>) => lazy(cargar);

/**
 * Envuelve un componente real de la oficina con datos simulados. Su código no está en el JavaScript inicial:
 * se pide solo cuando la demo se acerca a la pantalla y, mientras tanto, se ve la reserva.
 * La demo es una ilustración: no se puede usar con el teclado (inert) y se describe en texto.
 */
export function DemoEnVivo({ componente: Demo, props, reserva, descripcion, etiqueta = "Datos de ejemplo", className = "" }: Props) {
  const caja = useRef<HTMLDivElement>(null);
  const cerca = useInView(caja, { once: true, margin: "400px 0px" });

  return (
    <figure ref={caja} className={`relative ${className}`}>
      <figcaption className="sr-only">{descripcion}</figcaption>
      <span className="absolute -top-8 left-0 rounded-pill bg-black/40 px-3 py-1 text-tiny text-ink-2 ring-1 ring-white/15">{etiqueta}</span>
      {cerca ? <Suspense fallback={reserva}><Demo {...props} /></Suspense> : reserva}
    </figure>
  );
}
