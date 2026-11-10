"use client";

import { motion, useInView, useReducedMotion } from "framer-motion";
import { Check, Database, LineChart, MessageCircle, RotateCcw, Target, type LucideIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { GlassPanel, PillButton, departmentColor } from "@/components/glass";
import { cadenaEjemplo } from "@/data/publico";

const ICONOS: LucideIcon[] = [Target, MessageCircle, Database, LineChart];
const PASO_MS = 1300;

/**
 * Cadena de ejemplo entre departamentos. Al entrar en pantalla se recorre una vez, paso a paso
 * (no se repite sola: se puede volver a ver con el botón). Con movimiento reducido se muestra completa.
 */
export function CadenaDemo() {
  const zona = useRef<HTMLOListElement>(null);
  const enPantalla = useInView(zona, { once: true, margin: "-80px" });
  const reducido = useReducedMotion();
  const [paso, setPaso] = useState(-1);
  const [vuelta, setVuelta] = useState(0);
  const total = cadenaEjemplo.length;
  const actual = reducido ? total - 1 : paso;

  useEffect(() => {
    if (!enPantalla || reducido) return;
    const timers = cadenaEjemplo.map((_, i) => setTimeout(() => setPaso(i), 250 + i * PASO_MS));
    return () => timers.forEach(clearTimeout);
  }, [enPantalla, reducido, vuelta]);

  return (
    <div>
      <ol ref={zona} className="grid gap-3 lg:grid-cols-4 lg:gap-4">
        {cadenaEjemplo.map((p, i) => {
          const Icono = ICONOS[i];
          const hecho = i <= actual;
          const color = departmentColor[p.dept];
          return (
            <li key={p.texto} className="relative">
              {/* Conector hacia el siguiente paso: vertical en móvil, horizontal en escritorio (solo transform). */}
              {i < total - 1 && (
                <span aria-hidden="true" className="absolute top-full left-7 z-0 h-3 w-0.5 overflow-hidden bg-white/15 lg:top-1/2 lg:left-full lg:h-0.5 lg:w-4">
                  <motion.span
                    className="block size-full origin-top bg-white lg:origin-left"
                    initial={false}
                    animate={{ scale: i < actual ? 1 : 0 }}
                    transition={{ duration: 0.4, ease: "easeOut" }}
                  />
                </span>
              )}
              <GlassPanel strong={i === actual} className="relative flex h-full items-start gap-3 rounded-card! p-4 lg:flex-col">
                <span
                  aria-hidden="true"
                  className="relative flex size-10 shrink-0 items-center justify-center rounded-full"
                  style={{ background: `linear-gradient(135deg, ${color}, ${color}66)` }}
                >
                  <Icono size={18} />
                  {i === actual && !reducido && (
                    <motion.span
                      key={`${vuelta}-${i}`}
                      className="absolute inset-0 rounded-full ring-2 ring-white"
                      initial={{ scale: 1, opacity: 0.9 }}
                      animate={{ scale: 1.6, opacity: 0 }}
                      transition={{ duration: 1, ease: "easeOut" }}
                    />
                  )}
                </span>
                <div className="min-w-0">
                  <p className="text-tiny text-ink-2">
                    Paso {i + 1} · {p.quien}
                  </p>
                  <p className="mt-1 text-body font-semibold">{p.texto}</p>
                  <p className="mt-2 inline-flex items-center gap-1.5 text-tiny text-ink-2" aria-hidden="true">
                    {hecho ? (
                      <>
                        <Check size={13} className="text-status-working" /> Hecho
                      </>
                    ) : (
                      <>
                        <span className="size-2 rounded-full bg-status-paused" /> En espera
                      </>
                    )}
                  </p>
                </div>
              </GlassPanel>
            </li>
          );
        })}
      </ol>
      {!reducido && (
        <div className="mt-4 flex justify-end">
          <PillButton
            icon={RotateCcw}
            compact
            disabled={paso < total - 1}
            onClick={() => {
              setPaso(-1);
              setVuelta((v) => v + 1);
            }}
          >
            Ver otra vez
          </PillButton>
        </div>
      )}
    </div>
  );
}
