"use client";

import { motion } from "framer-motion";
import { BadgeCheck, CheckCircle2, Hand, Lock, Mail, RotateCcw, Send, X, type LucideIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { GlassPanel } from "@/components/glass";
import { usePreferencias } from "@/components/marketing/preferencias";
import { borradorDemo, controlInicio } from "@/content/inicio";

const ICONOS: LucideIcon[] = [Hand, CheckCircle2, BadgeCheck, Lock];

/** Las cuatro garantías, reveladas en cascada al entrar en pantalla. */
export function TarjetasControl() {
  const { reducido } = usePreferencias();
  return (
    <ul className="grid gap-4 sm:grid-cols-2">
      {controlInicio.map((c, i) => {
        const Icono = ICONOS[i];
        return (
          <motion.li
            key={c.titulo}
            className="glass flex gap-4 rounded-card p-5"
            initial={reducido ? false : { opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "0px 0px -15% 0px" }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1], delay: i * 0.12 }}
          >
            <Icono size={22} aria-hidden="true" className="mt-0.5 shrink-0 text-status-working" />
            <div>
              <h3 className="text-body font-semibold">{c.titulo}</h3>
              <p className="mt-1 text-small text-ink-2">{c.texto}</p>
            </div>
          </motion.li>
        );
      })}
    </ul>
  );
}

type Estado = "pendiente" | "enviando" | "entregado" | "rechazado";

/**
 * Demo de aprobación: un borrador de Lucía que el visitante aprueba (o rechaza) con un clic.
 * Es una simulación en el navegador: no se envía nada ni se llama a ningún servidor.
 */
export function BorradorDemo() {
  const [estado, setEstado] = useState<Estado>("pendiente");

  useEffect(() => {
    if (estado !== "enviando") return;
    const t = setTimeout(() => setEstado("entregado"), 1100);
    return () => clearTimeout(t);
  }, [estado]);

  const etiqueta: Record<Estado, { texto: string; clase: string }> = {
    pendiente: { texto: "Pendiente de tu aprobación", clase: "bg-status-waiting/20 text-status-waiting ring-status-waiting/40" },
    enviando: { texto: "Enviando…", clase: "bg-white/10 text-white ring-white/25" },
    entregado: { texto: "Enviado · Entregado", clase: "bg-status-working/20 text-status-working ring-status-working/40" },
    rechazado: { texto: "Rechazado · no se envía", clase: "bg-white/10 text-ink-2 ring-white/20" },
  };

  return (
    <GlassPanel className="flex flex-col gap-4 p-5 sm:p-6 [--glass-fill:rgba(16,16,22,0.5)]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="inline-flex items-center gap-2 text-small font-semibold"><Mail size={16} aria-hidden="true" /> Borrador de {borradorDemo.de}</p>
        <span role="status" aria-live="polite" className={`rounded-pill px-2.5 py-1 text-tiny ring-1 ${etiqueta[estado].clase}`}>
          {etiqueta[estado].texto}
        </span>
      </div>
      <dl className="grid grid-cols-[4.5rem_1fr] gap-x-3 gap-y-1 border-y border-white/10 py-3 text-small">
        <dt className="text-ink-2">Para</dt>
        <dd className="truncate">{borradorDemo.para}</dd>
        <dt className="text-ink-2">Asunto</dt>
        <dd>{borradorDemo.asunto}</dd>
      </dl>
      <div className={`flex flex-col gap-2 text-small ${estado === "rechazado" ? "text-ink-3 line-through" : "text-white/90"}`}>
        {borradorDemo.cuerpo.map((l) => <p key={l}>{l}</p>)}
      </div>
      <div className="flex flex-wrap items-center gap-2 pt-1">
        {estado === "pendiente" ? (
          <>
            <button type="button" onClick={() => setEstado("enviando")} className="inline-flex items-center gap-2 rounded-pill bg-white px-5 py-2.5 text-small font-semibold text-black hover:bg-white/90">
              <Send size={15} aria-hidden="true" /> Aprobar y enviar
            </button>
            <button type="button" onClick={() => setEstado("rechazado")} className="inline-flex items-center gap-2 rounded-pill bg-white/10 px-5 py-2.5 text-small ring-1 ring-white/25 hover:bg-white/15">
              <X size={15} aria-hidden="true" /> Rechazar
            </button>
          </>
        ) : (
          <button
            type="button"
            disabled={estado === "enviando"}
            onClick={() => setEstado("pendiente")}
            className="inline-flex items-center gap-2 rounded-pill bg-white/10 px-5 py-2.5 text-small ring-1 ring-white/25 hover:bg-white/15 disabled:opacity-50"
          >
            <RotateCcw size={15} aria-hidden="true" /> Volver a probar
          </button>
        )}
      </div>
      <p className="text-tiny text-ink-3">Demostración: no se envía ningún correo. En la oficina real, quién aprueba y el texto exacto quedan registrados.</p>
    </GlassPanel>
  );
}
