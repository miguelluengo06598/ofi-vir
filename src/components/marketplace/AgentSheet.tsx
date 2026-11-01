"use client";

import { motion } from "framer-motion";
import { Check, X } from "lucide-react";
import { useRef } from "react";
import { useFocusTrap } from "@/lib/useFocusTrap";
import { Avatar, MotionGlassPanel, PillButton, departmentMeta } from "@/components/glass";
import type { MarketAgent } from "@/data/marketplace";
import { CreatorBadge, Rating, Stats, agentTone } from "./parts";

type Props = {
  agent: MarketAgent;
  hired: boolean;
  /** Desactívalo mientras otro diálogo (contratar) está encima. */
  trap: boolean;
  onHire: () => void;
  onClose: () => void;
};

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <h3 id={id} className="text-h2">
        {title}
      </h3>
      {children}
    </section>
  );
}

function List({ items, icon: Icon, tone }: { items: string[]; icon: typeof Check; tone: string }) {
  return (
    <ul className="flex flex-col gap-2">
      {items.map((t) => (
        <li key={t} className="flex gap-2 text-small">
          <Icon size={16} aria-hidden="true" className={`mt-0.5 shrink-0 ${tone}`} />
          {t}
        </li>
      ))}
    </ul>
  );
}

export function AgentSheet({ agent, hired, trap, onHire, onClose }: Props) {
  const tone = agentTone(agent);
  const dialog = useRef<HTMLElement>(null);
  useFocusTrap(dialog, trap);
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
          layoutId={`market-${agent.id}`}
          role="dialog"
          aria-modal="true"
          aria-labelledby="sheet-title"
          style={{ borderRadius: 28 }}
          className="pointer-events-auto flex max-h-full w-full max-w-3xl flex-col overflow-hidden"
        >
          <motion.div
            className="flex min-h-0 flex-1 flex-col overflow-y-auto"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: { delay: 0.15, duration: 0.2 } }}
            exit={{ opacity: 0, transition: { duration: 0.1 } }}
          >
            <header className={`flex flex-col gap-4 p-6 ${departmentMeta[tone].header}`}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-4">
                  <Avatar name={agent.name} tone={tone} size={64} />
                  <div>
                    <h2 id="sheet-title" className="text-h1">
                      {agent.name}
                    </h2>
                    <p className="text-body text-ink-2">{agent.role}</p>
                  </div>
                </div>
                <PillButton icon={X} aria-label="Cerrar" autoFocus onClick={onClose} />
              </div>
              <CreatorBadge agent={agent} />
              <Stats agent={agent} />
              <div>
                <PillButton
                  icon={hired ? Check : undefined}
                  active={!hired}
                  aria-pressed={undefined}
                  disabled={hired}
                  onClick={onHire}
                >
                  {hired ? "Contratado" : "Contratar"}
                </PillButton>
              </div>
            </header>

            <div className="flex flex-col gap-8 p-6">
              <p className="text-body text-ink-2">{agent.summary}</p>

              <div className="grid gap-8 sm:grid-cols-2">
                <Section id="sheet-does" title="Qué hace">
                  <List items={agent.does} icon={Check} tone="text-status-working" />
                </Section>
                <Section id="sheet-doesnt" title="Qué no hace">
                  <List items={agent.doesNot} icon={X} tone="text-status-error" />
                </Section>
              </div>

              <Section id="sheet-tools" title="Herramientas que necesita">
                <ul className="flex flex-wrap gap-2">
                  {agent.tools.map((t) => (
                    <li key={t} className="rounded-pill bg-glass-strong px-3 py-1 text-small">
                      {t}
                    </li>
                  ))}
                </ul>
              </Section>

              <Section id="sheet-examples" title="Ejemplos de tareas">
                <ul className="flex flex-col">
                  {agent.examples.map((t) => (
                    <li key={t} className="border-b border-glass-border py-2 text-small last:border-b-0">
                      {t}
                    </li>
                  ))}
                </ul>
              </Section>

              <Section id="sheet-reviews" title="Opiniones">
                <ul className="flex flex-col gap-4">
                  {agent.reviews.map((r) => (
                    <li key={r.author} className="flex flex-col gap-1">
                      <div className="flex flex-wrap items-center gap-x-3 text-small">
                        <span className="font-semibold">{r.author}</span>
                        <span className="text-ink-3">{r.company}</span>
                        <Rating value={r.rating} />
                      </div>
                      <p className="text-small text-ink-2">{r.text}</p>
                    </li>
                  ))}
                </ul>
              </Section>
            </div>
          </motion.div>
        </MotionGlassPanel>
      </div>
    </>
  );
}
