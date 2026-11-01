"use client";

import { motion } from "framer-motion";
import { X } from "lucide-react";
import { useRef, useState } from "react";
import { useFocusTrap } from "@/lib/useFocusTrap";
import { Avatar, MotionGlassPanel, PillButton, departmentMeta, type DepartmentId } from "@/components/glass";
import type { DepartmentSummary } from "@/data/departments";
import { categoryDepartment, type MarketAgent } from "@/data/marketplace";
import { agentTone } from "./parts";

type Props = {
  agent: MarketAgent;
  summaries: DepartmentSummary[];
  onConfirm: (departmentId: DepartmentId) => void;
  onClose: () => void;
};

/** Pide el departamento donde trabajará el agente. Se superpone a la ficha si está abierta. */
export function HireDialog({ agent, summaries, onConfirm, onClose }: Props) {
  const suggested = categoryDepartment[agent.category];
  const [choice, setChoice] = useState<DepartmentId>(suggested);
  const dialog = useRef<HTMLElement>(null);
  useFocusTrap(dialog);

  return (
    <>
      <motion.div
        aria-hidden="true"
        className="fixed inset-0 z-[60] bg-black/50"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      />
      <div className="pointer-events-none fixed inset-0 z-[70] flex items-center justify-center p-4">
        <MotionGlassPanel
          ref={dialog}
          role="dialog"
          aria-modal="true"
          aria-labelledby="hire-title"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 12 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          className="pointer-events-auto flex max-h-full w-full max-w-md flex-col gap-5 overflow-y-auto p-6"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <Avatar name={agent.name} tone={agentTone(agent)} size={48} />
              <div>
                <h2 id="hire-title" className="text-h2">
                  Contratar a {agent.name.split(" ")[0]}
                </h2>
                <p className="text-small text-ink-2">¿En qué departamento trabajará?</p>
              </div>
            </div>
            <PillButton icon={X} aria-label="Cerrar" onClick={onClose} />
          </div>

          <div role="radiogroup" aria-label="Departamento" className="flex flex-col gap-2">
            {summaries.map((s) => {
              const meta = departmentMeta[s.id];
              const Icon = meta.icon;
              const selected = choice === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setChoice(s.id)}
                  className={`flex cursor-pointer items-center gap-3 rounded-card border p-3 text-left transition-colors ${
                    selected ? "border-accent bg-accent/25" : "border-glass-border bg-glass hover:bg-glass-strong"
                  }`}
                >
                  <Icon size={18} aria-hidden="true" />
                  <span className="flex-1 text-small font-semibold">{meta.label}</span>
                  {s.id === suggested && <span className="text-tiny text-ink-2">Recomendado</span>}
                  <span className="text-tiny text-ink-3">{s.agents.length} agentes</span>
                </button>
              );
            })}
          </div>

          <PillButton active aria-pressed={undefined} onClick={() => onConfirm(choice)} className="self-end">
            Contratar a {agent.name.split(" ")[0]}
          </PillButton>
        </MotionGlassPanel>
      </div>
    </>
  );
}
