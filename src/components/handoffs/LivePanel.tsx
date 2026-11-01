"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Pause, Play, Radio, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { GlassPanel, PillButton } from "@/components/glass";
import { useSimulation } from "@/components/SimulationProvider";
import { agentById, firstName } from "@/data/agents";
import { kindLabel } from "@/data/handoffs";
import { HandoffPair, HandoffStatusText } from "./parts";

const SHOWN = 5;
const ANNOUNCE_EVERY_MS = 10_000;

/** Panel «En directo»: los últimos traspasos. En móvil se despliega desde un botón sobre el dock. */
export function LivePanel() {
  const { events, latest, paused, toggle, openChain } = useSimulation();
  const [open, setOpen] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const lastAnnounced = useRef(0);

  // Región aria-live: como mucho un anuncio cada 10 s.
  useEffect(() => {
    if (!latest) return;
    const now = Date.now();
    if (now - lastAnnounced.current < ANNOUNCE_EVERY_MS) return;
    lastAnnounced.current = now;
    const { handoff: h } = latest;
    setAnnouncement(`Traspaso de ${firstName(agentById(h.fromAgentId).name)} a ${firstName(agentById(h.toAgentId).name)}: ${h.summary}`);
  }, [latest]);

  const recent = events.slice(-SHOWN).reverse();

  return (
    <>
      <div role="status" aria-live="polite" className="sr-only">
        {announcement}
      </div>

      <div className="fixed right-4 bottom-24 z-30 md:hidden">
        <PillButton icon={open ? X : Radio} active={open} aria-pressed={undefined} aria-expanded={open} aria-controls="en-directo" onClick={() => setOpen((o) => !o)}>
          En directo
        </PillButton>
      </div>

      <GlassPanel
        as="section"
        id="en-directo"
        aria-label="En directo"
        className={`fixed right-4 bottom-40 left-4 z-30 flex-col gap-1 p-3 md:right-6 md:bottom-6 md:left-auto md:flex md:w-[22rem] ${open ? "flex" : "hidden"}`}
      >
        <div className="flex items-center justify-between gap-2 px-2 py-1">
          <h2 className="flex items-center gap-2 text-small font-semibold">
            <span aria-hidden="true" className={`size-2 rounded-full ${paused ? "bg-status-paused" : "animate-pulse bg-status-working"}`} />
            {paused ? "En directo · en pausa" : "En directo"}
          </h2>
          <PillButton icon={paused ? Play : Pause} compact aria-label={paused ? "Reanudar la simulación" : "Pausar la simulación"} onClick={toggle} />
        </div>
        <ul className="flex flex-col">
          <AnimatePresence initial={false}>
            {recent.map((e) => (
              <motion.li
                key={e.seq}
                layout="position"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.25 }}
                className="overflow-hidden"
              >
                <button
                  type="button"
                  aria-label={`Abrir la cadena: ${e.handoff.summary}`}
                  onClick={() => openChain(e.handoff.chainId)}
                  className="flex w-full cursor-pointer items-center gap-3 rounded-card px-2 py-2 text-left transition-colors hover:bg-white/10"
                >
                  <HandoffPair handoff={e.handoff} />
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-2 block text-tiny leading-snug">
                      <span className="text-ink-3">{kindLabel[e.handoff.kind]} · </span>
                      {e.handoff.summary}
                    </span>
                    <span className="mt-0.5 flex items-center gap-2">
                      <span className="text-tiny text-ink-3">{e.time}</span>
                      <HandoffStatusText status={e.status} />
                    </span>
                  </span>
                </button>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      </GlassPanel>
    </>
  );
}
