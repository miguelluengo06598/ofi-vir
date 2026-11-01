"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronDown, Coins, Target, X } from "lucide-react";
import { useEffect, useId, useRef } from "react";
import { useApprovals } from "@/components/ApprovalsProvider";
import { MotionGlassPanel, PillButton, departmentColor, departmentMeta } from "@/components/glass";
import { useSimulation } from "@/components/SimulationProvider";
import { approvals } from "@/data/approvals";
import { agentById, firstName } from "@/data/agents";
import { chainById, chainCost, kindLabel, type Handoff } from "@/data/handoffs";
import { fmtNumber } from "@/lib/format";
import { useFocusTrap } from "@/lib/useFocusTrap";
import { HandoffPair, HandoffStatusText, useResolvedStatus } from "./parts";

const credits = (n: number) => `${fmtNumber(n, 1)} créditos`;

function Step({ handoff }: { handoff: Handoff }) {
  const { decisions, decide } = useApprovals();
  const from = agentById(handoff.fromAgentId);
  const to = agentById(handoff.toAgentId);
  const approval = approvals.find((a) => a.id === handoff.approvalId);
  const decision = decisions.find((d) => d.approvalId === handoff.approvalId)?.decision;
  const status = useResolvedStatus(handoff);

  return (
    <li className="group relative flex gap-4 pb-6 last:pb-0">
      <span
        aria-hidden="true"
        className="absolute top-3 bottom-0 left-[5px] w-px bg-white/20 group-last:hidden"
      />
      <span
        aria-hidden="true"
        className="relative mt-1.5 size-3 shrink-0 rounded-full ring-4 ring-black/30"
        style={{ background: `linear-gradient(135deg, ${departmentColor[handoff.fromDepartmentId]}, ${departmentColor[handoff.toDepartmentId]})` }}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <HandoffPair handoff={handoff} size={32} />
          <span className="text-small">
            <span className="font-semibold">{firstName(from.name)}</span>
            <span className="text-ink-3"> · {departmentMeta[handoff.fromDepartmentId].label} → </span>
            <span className="font-semibold">{firstName(to.name)}</span>
            <span className="text-ink-3"> · {departmentMeta[handoff.toDepartmentId].label}</span>
          </span>
        </div>
        <p className="text-body">
          <span className="mr-2 rounded-pill bg-white/15 px-2 py-0.5 text-tiny">{kindLabel[handoff.kind]}</span>
          {handoff.summary}
        </p>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-tiny text-ink-2">
          <span>{handoff.time}</span>
          <span className="inline-flex items-center gap-1">
            <Coins size={12} aria-hidden="true" />
            {credits(handoff.credits)}
          </span>
          <HandoffStatusText status={status} />
        </div>

        <details className="group/ficha">
          <summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded-pill text-small text-ink-2 hover:text-white [&::-webkit-details-marker]:hidden">
            <ChevronDown size={14} aria-hidden="true" className="transition-transform group-open/ficha:rotate-180" />
            Ficha con los datos traspasados
          </summary>
          <dl className="mt-2 grid gap-2 rounded-card bg-black/25 p-3 sm:grid-cols-[10rem_1fr]">
            {handoff.card.map((f) => (
              <div key={f.label} className="contents">
                <dt className="text-tiny text-ink-3">{f.label}</dt>
                <dd className="text-small">{f.value}</dd>
              </div>
            ))}
          </dl>
        </details>

        {approval && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-card bg-black/25 p-3">
            <div className="min-w-0 flex-1">
              <p className="text-small font-semibold">Necesita tu aprobación</p>
              <p className="text-tiny text-ink-2">{approval.title}</p>
            </div>
            {decision ? (
              <p className="text-small font-semibold">{decision === "approved" ? "Aprobado" : "Rechazado"}</p>
            ) : (
              <div className="flex gap-2">
                <PillButton icon={Check} active aria-pressed={undefined} onClick={() => decide(approval.id, "approved")}>
                  Aprobar
                </PillButton>
                <PillButton icon={X} onClick={() => decide(approval.id, "rejected")}>
                  Rechazar
                </PillButton>
              </div>
            )}
          </div>
        )}
      </div>
    </li>
  );
}

function Content({ chainId }: { chainId: string }) {
  const { closeChain } = useSimulation();
  const chain = chainById(chainId);
  const dialog = useRef<HTMLElement>(null);
  const id = useId();
  useFocusTrap(dialog);

  // Escape en fase de captura: cierra solo este diálogo y no los que haya debajo.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      closeChain();
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [closeChain]);

  return (
    <>
      <motion.div
        aria-hidden="true"
        className="fixed inset-0 z-[60] bg-black/50"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={closeChain}
      />
      <div className="pointer-events-none fixed inset-0 z-[70] flex items-center justify-center p-4 md:pl-24">
        <MotionGlassPanel
          ref={dialog}
          role="dialog"
          aria-modal="true"
          aria-labelledby={`${id}-title`}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 12 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          className="pointer-events-auto flex max-h-full w-full max-w-2xl flex-col overflow-y-auto p-6"
        >
          <header className="flex flex-col gap-3 border-b border-glass-border pb-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-tiny text-ink-2">Cadena de traspasos</p>
                <h2 id={`${id}-title`} className="text-h2">
                  {chain.title}
                </h2>
              </div>
              <PillButton icon={X} aria-label="Cerrar" autoFocus onClick={closeChain} />
            </div>
            <p className="flex items-start gap-2 text-small text-ink-2">
              <Target size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
              <span>
                <span className="font-semibold text-white">Objetivo: </span>
                {chain.goal}
              </span>
            </p>
            <p className="flex items-center gap-4 text-small">
              <span className="inline-flex items-center gap-1.5">
                <Coins size={14} aria-hidden="true" />
                Coste total: <strong>{credits(chainCost(chain))}</strong>
              </span>
              <span className="text-ink-2">{chain.handoffs.length} traspasos</span>
            </p>
          </header>
          <ol className="mt-5 flex flex-col" aria-label="Línea de tiempo de la cadena">
            {chain.handoffs.map((h) => (
              <Step key={h.id} handoff={h} />
            ))}
          </ol>
        </MotionGlassPanel>
      </div>
    </>
  );
}

/** Diálogo global con la cadena completa como línea de tiempo vertical. */
export function ChainDialog() {
  const { chainId } = useSimulation();
  return <AnimatePresence>{chainId && <Content key={chainId} chainId={chainId} />}</AnimatePresence>;
}
