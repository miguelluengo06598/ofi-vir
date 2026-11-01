"use client";

import { motion } from "framer-motion";
import { X } from "lucide-react";
import { useRef } from "react";
import { MotionGlassPanel, PillButton } from "@/components/glass";
import { AgentProfile } from "@/components/messages/AgentProfile";
import type { OfficeAgent } from "@/data/departments";
import { useFocusTrap } from "@/lib/useFocusTrap";

/** Ficha del agente (la misma que se ve en Mensajes) en un panel que se expande desde su tarjeta. */
export function AgentDialog({ agent, onClose }: { agent: OfficeAgent; onClose: () => void }) {
  const dialog = useRef<HTMLElement>(null);
  useFocusTrap(dialog);
  return (
    <>
      <motion.div
        aria-hidden="true"
        className="fixed inset-0 z-40 bg-black/40"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      />
      <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center p-4 md:pl-24">
        <MotionGlassPanel
          ref={dialog}
          layoutId={`agent-${agent.id}`}
          role="dialog"
          aria-modal="true"
          aria-label={`Ficha de ${agent.name}`}
          style={{ borderRadius: 28 }}
          className="pointer-events-auto relative flex max-h-full w-full max-w-sm flex-col overflow-hidden"
        >
          <motion.div
            className="flex min-h-0 flex-1 flex-col"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: { delay: 0.15, duration: 0.2 } }}
            exit={{ opacity: 0, transition: { duration: 0.1 } }}
          >
            <div className="absolute top-4 right-4 z-10">
              <PillButton icon={X} aria-label="Cerrar" autoFocus onClick={onClose} />
            </div>
            <AgentProfile agent={agent} />
          </motion.div>
        </MotionGlassPanel>
      </div>
    </>
  );
}
