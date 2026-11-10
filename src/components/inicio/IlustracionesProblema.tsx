"use client";

import { motion } from "framer-motion";
import { Database, Moon, Unplug } from "lucide-react";
import type { ReactNode } from "react";
import { departmentColor } from "@/components/glass/tokens";
import { usePreferencias } from "@/components/marketing/preferencias";

/** Lienzo común de las ilustraciones (dentro del panel de cristal: sin cristal propio). */
function Lienzo({ children }: { children: ReactNode }) {
  return <div className="relative flex size-full flex-col justify-center gap-3 overflow-hidden rounded-card bg-black/30 p-5 ring-1 ring-white/10">{children}</div>;
}

const bucle = (reducido: boolean, keyframes: Record<string, number[]>, duration = 4, delay = 0) =>
  reducido ? {} : { animate: keyframes, transition: { duration, repeat: Infinity, ease: "easeInOut" as const, delay } };

/** 22:00 · el lead escribe y nadie responde. */
export function IlustracionNoche() {
  const { reducido } = usePreferencias();
  return (
    <Lienzo>
      <div className="flex items-center justify-between text-small text-ink-2">
        <span className="inline-flex items-center gap-2"><Moon size={16} aria-hidden="true" /> Jueves</span>
        <span className="font-semibold text-white tabular-nums">22:00</span>
      </div>
      <motion.div className="max-w-[85%] self-start rounded-[16px] rounded-bl-sm bg-white/90 px-4 py-2.5 text-small text-black" {...bucle(reducido, { y: [6, 0, 0, 0], opacity: [0, 1, 1, 1] }, 5)}>
        Hola, ¿tenéis hueco mañana para una limpieza?
      </motion.div>
      <motion.div className="flex items-center gap-1.5 self-end rounded-pill bg-white/10 px-3 py-2" {...bucle(reducido, { opacity: [0, 0, 1, 0] }, 5)}>
        {[0, 1, 2].map((i) => (
          <motion.span key={i} className="size-1.5 rounded-full bg-white/70" {...bucle(reducido, { y: [0, -3, 0] }, 0.9, i * 0.15)} />
        ))}
      </motion.div>
      <motion.p className="self-end text-tiny text-status-waiting" {...bucle(reducido, { opacity: [0, 0, 0, 1] }, 5)} style={reducido ? undefined : { opacity: 0 }}>
        Visto · sin respuesta hasta mañana a las 9:30
      </motion.p>
    </Lienzo>
  );
}

/** WhatsApp y Ventas no se hablan. */
export function IlustracionWhatsapp() {
  const { reducido } = usePreferencias();
  return (
    <Lienzo>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <div className="rounded-card p-3 ring-1 ring-white/15" style={{ background: `${departmentColor.atencion}33` }}>
          <p className="text-tiny text-ink-2">WhatsApp</p>
          <p className="mt-1 text-small">¿Tenéis financiación en 12 meses?</p>
        </div>
        <motion.span className="flex size-9 items-center justify-center rounded-full bg-status-error/20 text-status-error ring-1 ring-status-error/50" {...bucle(reducido, { scale: [1, 1.12, 1] }, 1.8)}>
          <Unplug size={16} aria-hidden="true" />
        </motion.span>
        <div className="rounded-card p-3 ring-1 ring-white/15" style={{ background: `${departmentColor.ventas}33` }}>
          <p className="text-tiny text-ink-2">Ventas</p>
          <p className="mt-1 text-small text-ink-2">Sin historial del cliente</p>
        </div>
      </div>
      <div className="relative mx-6 h-px border-t border-dashed border-white/30" aria-hidden="true">
        {!reducido && (
          <motion.span className="absolute -top-px left-0 h-0.5 w-[45%] origin-left rounded-full bg-white/80" animate={{ scaleX: [0, 1], opacity: [1, 0] }} transition={{ duration: 1.6, repeat: Infinity, ease: "easeIn" }} />
        )}
      </div>
      <p className="text-center text-tiny text-ink-2">La pregunta se queda en un canal y la respuesta en otro.</p>
    </Lienzo>
  );
}

/** Un CRM abandonado. */
export function IlustracionCrm() {
  const { reducido } = usePreferencias();
  const filas = ["Etapa", "Teléfono", "Próximo paso", "Notas"];
  return (
    <Lienzo>
      <div className="flex items-center justify-between">
        <p className="inline-flex items-center gap-2 text-small font-semibold"><Database size={15} aria-hidden="true" /> Ficha de cliente</p>
        <span className="rounded-pill bg-white/10 px-2 py-0.5 text-tiny text-ink-2">Actualizada hace 7 meses</span>
      </div>
      {filas.map((f, i) => (
        <div key={f} className="grid grid-cols-[6.5rem_1fr] items-center gap-3 text-small">
          <span className="text-ink-2">{f}</span>
          <motion.span className="h-3 rounded-full bg-white/15" style={{ width: `${[45, 0, 30, 0][i] || 18}%` }} {...bucle(reducido, { opacity: [0.35, 0.7, 0.35] }, 2.4, i * 0.3)} />
        </div>
      ))}
      <p className="text-tiny text-status-waiting">2 fichas duplicadas · 14 sin próximo paso</p>
    </Lienzo>
  );
}
