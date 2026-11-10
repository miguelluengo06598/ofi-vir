"use client";

import { motion } from "framer-motion";
import { ArrowLeftRight, Brain, Mail, MessageCircle, MessageSquareText, Sparkles, type LucideIcon } from "lucide-react";
import { usePreferencias } from "@/components/marketing/preferencias";
import { tarifasVisibles, type TarifaVisible } from "@/content/precios";

const ICONOS: Record<TarifaVisible["icono"], LucideIcon> = {
  chispa: Sparkles,
  mensaje: MessageSquareText,
  cerebro: Brain,
  flechas: ArrowLeftRight,
  correo: Mail,
  whatsapp: MessageCircle,
};

/** Movimiento propio de cada icono (una vez al entrar y al pasar el ratón): solo transform. */
const GESTO: Record<TarifaVisible["icono"], { rotate?: number[]; scale?: number[]; x?: number[]; y?: number[] }> = {
  chispa: { rotate: [0, 18, -10, 0], scale: [1, 1.2, 1] },
  mensaje: { y: [0, -4, 0, -2, 0] },
  cerebro: { scale: [1, 1.15, 0.95, 1] },
  flechas: { x: [0, 5, -5, 0] },
  correo: { x: [0, 6, 0], y: [0, -4, 0] },
  whatsapp: { rotate: [0, -12, 12, 0] },
};

/** «Qué cuesta cada cosa»: una tarjeta por tipo de tarea con su coste fijo (de tarifas.ts) y ejemplos. */
export function TarifasAnimadas() {
  const { reducido } = usePreferencias();
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {tarifasVisibles.map((t, i) => {
        const Icono = ICONOS[t.icono];
        const gesto = GESTO[t.icono];
        return (
          <motion.li
            key={t.id}
            className="glass glass-interactive group flex flex-col gap-4 rounded-card p-6"
            initial={reducido ? false : { opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "0px 0px -10% 0px" }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1], delay: i * 0.07 }}
            whileHover="gesto"
          >
            <div className="flex items-center justify-between gap-3">
              <motion.span
                aria-hidden="true"
                className="flex size-12 items-center justify-center rounded-full bg-white/10 ring-1 ring-white/20"
                initial={false}
                whileInView={reducido ? undefined : gesto}
                variants={reducido ? undefined : { gesto }}
                viewport={{ once: true }}
                transition={{ duration: 0.9, ease: "easeInOut", delay: 0.3 + i * 0.07 }}
              >
                <Icono size={22} />
              </motion.span>
              <p className="text-right">
                {t.creditos === null ? (
                  <span className="text-body text-ink-2">Por definir</span>
                ) : (
                  <>
                    <span className="text-[32px] leading-none font-semibold tabular-nums">{t.creditos}</span>{" "}
                    <span className="text-small text-ink-2">{t.creditos === 1 ? "crédito" : "créditos"}</span>
                  </>
                )}
              </p>
            </div>
            <div>
              <h3 className="text-h2">{t.nombre}</h3>
              <p className="mt-1.5 text-small text-ink-2">{t.ejemplos}</p>
            </div>
            {t.creditos !== null && (
              <p className="mt-auto text-tiny text-ink-3">
                ≈ {(t.creditos / 100).toLocaleString("es-ES", { style: "currency", currency: "EUR", minimumFractionDigits: 2 })} sin IVA
              </p>
            )}
          </motion.li>
        );
      })}
    </ul>
  );
}
