"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useRef } from "react";
import { useFocusTrap } from "@/lib/useFocusTrap";
import { Check, X } from "lucide-react";
import {
  Avatar,
  GlassPanel,
  MotionGlassPanel,
  PillButton,
  StatusBadge,
  departmentMeta,
} from "@/components/glass";
import { activity, approvals as allApprovals } from "@/data/approvals";
import { useSimulation } from "@/components/SimulationProvider";
import { ResolvedStatusText } from "@/components/handoffs/parts";
import { agentById, firstName } from "@/data/agents";
import { allHandoffs, kindLabel } from "@/data/handoffs";
import { type Decision } from "@/components/ApprovalsProvider";
import { departmentInfo, type DepartmentSummary } from "@/data/departments";

type Props = {
  summary: DepartmentSummary;
  decisions: Decision[];
  onDecide: (approvalId: string, decision: Decision["decision"]) => void;
  onClose: () => void;
};

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

export function DepartmentPanel({ summary, decisions, onDecide, onClose }: Props) {
  const { id, agents, pending } = summary;
  const meta = departmentMeta[id];
  const info = departmentInfo[id];
  const Icon = meta.icon;
  const dialog = useRef<HTMLElement>(null);
  useFocusTrap(dialog);
  const { seen, openChain } = useSimulation();
  const emitted = allHandoffs.filter((h) => seen.has(h.id));
  const received = emitted.filter((h) => h.toDepartmentId === id && h.fromDepartmentId !== id);
  const sent = emitted.filter((h) => h.fromDepartmentId === id && h.toDepartmentId !== id);

  // Decisiones tomadas aquí (las más recientes primero) delante de la actividad simulada.
  const decided = decisions
    .map((d) => ({ ...d, approval: allApprovals.find((a) => a.id === d.approvalId)! }))
    .filter((d) => d.approval.departmentId === id)
    .reverse()
    .map((d) => ({
      id: d.approvalId,
      time: "Ahora",
      text: `${d.decision === "approved" ? "Aprobaste" : "Rechazaste"}: ${d.approval.title}.`,
    }));
  const recent = [...decided, ...activity.filter((a) => a.departmentId === id)];

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
          layoutId={`dept-${id}`}
          role="dialog"
          aria-modal="true"
          aria-labelledby="dept-panel-title"
          style={{ borderRadius: 28 }}
          className="pointer-events-auto flex max-h-full w-full max-w-4xl flex-col overflow-hidden"
        >
          <motion.div
            className="flex min-h-0 flex-1 flex-col overflow-y-auto"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: { delay: 0.15, duration: 0.2 } }}
            exit={{ opacity: 0, transition: { duration: 0.1 } }}
          >
            <header className={`flex flex-col gap-4 p-6 ${meta.header}`}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex flex-col gap-1">
                  <h2 id="dept-panel-title" className="flex items-center gap-3 text-h1">
                    <Icon size={26} aria-hidden="true" />
                    {meta.label}
                  </h2>
                  <p className="max-w-xl text-body text-ink-2">{info.description}</p>
                </div>
                <PillButton
                  icon={X}
                  aria-label="Cerrar"
                  autoFocus
                  onClick={onClose}
                />
              </div>
              <dl className="flex flex-wrap gap-x-10 gap-y-3">
                {info.metrics.map((m) => (
                  <div key={m.label}>
                    <dd className="text-h1">{m.value}</dd>
                    <dt className="text-small text-ink-2">{m.label}</dt>
                  </div>
                ))}
              </dl>
            </header>

            <div className="flex flex-col gap-8 p-6">
              <section aria-labelledby="dept-agents" className="flex flex-col gap-3">
                <h3 id="dept-agents" className="text-h2">
                  Agentes
                </h3>
                <ul className="flex flex-col gap-3">
                  {agents.map((a) => (
                    <GlassPanel
                      as="li"
                      key={a.id}
                      className="flex flex-col gap-2 rounded-card! p-3"
                    >
                      <div className="flex items-center gap-3">
                        <Avatar name={a.name} tone={id} status={a.status} />
                        <div className="min-w-0 flex-1">
                          <p className="text-body font-semibold">{a.name}</p>
                          <p className="text-small text-ink-2">{a.role}</p>
                        </div>
                        <StatusBadge
                          status={a.status}
                          detail={a.consultation ? `respuesta en ~${a.consultation.estimatedHours} h` : undefined}
                        />
                      </div>
                      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-small sm:pl-13">
                        <p>{capitalize(a.currentTask)}</p>
                        <p className="text-tiny text-ink-3">Creador: {a.creator}</p>
                      </div>
                    </GlassPanel>
                  ))}
                </ul>
              </section>

              <section aria-labelledby="dept-approvals" className="flex flex-col gap-3">
                <h3 id="dept-approvals" className="text-h2">
                  Pendiente de tu aprobación
                </h3>
                {pending.length === 0 && (
                  <p className="text-small text-ink-2">No tienes nada pendiente en este departamento.</p>
                )}
                <ul className="flex flex-col">
                  <AnimatePresence initial={false}>
                    {pending.map((p) => {
                      const agent = agents.find((a) => a.id === p.agentId);
                      return (
                        <motion.li
                          key={p.id}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.25 }}
                          className="overflow-hidden"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-glass-border py-3">
                            <div className="min-w-0 flex-1">
                              <p className="text-body font-semibold">{p.title}</p>
                              <p className="text-small text-ink-2">{p.detail}</p>
                              {agent && <p className="text-tiny text-ink-3">Solicitado por {agent.name}</p>}
                            </div>
                            <div className="flex gap-2">
                              <PillButton
                                icon={Check}
                                active
                                aria-pressed={undefined}
                                onClick={() => onDecide(p.id, "approved")}
                              >
                                Aprobar
                              </PillButton>
                              <PillButton icon={X} onClick={() => onDecide(p.id, "rejected")}>
                                Rechazar
                              </PillButton>
                            </div>
                          </div>
                        </motion.li>
                      );
                    })}
                  </AnimatePresence>
                </ul>
              </section>

              <section aria-labelledby="dept-handoffs" className="flex flex-col gap-3">
                <h3 id="dept-handoffs" className="text-h2">
                  Con otros departamentos
                </h3>
                <div className="grid gap-6 md:grid-cols-2">
                  {[
                    { title: "Ha recibido hoy", list: received, other: "fromAgentId" as const, otherDept: "fromDepartmentId" as const, verb: "de" },
                    { title: "Ha enviado hoy", list: sent, other: "toAgentId" as const, otherDept: "toDepartmentId" as const, verb: "a" },
                  ].map(({ title, list, other, otherDept, verb }) => (
                    <div key={title} className="flex flex-col gap-1">
                      <h4 className="text-small font-semibold text-ink-2">
                        {title} ({list.length})
                      </h4>
                      {list.length === 0 && <p className="text-small text-ink-3">Todavía nada.</p>}
                      <ul className="flex flex-col">
                        {list.map((h) => (
                          <li key={h.id} className="border-b border-glass-border last:border-b-0">
                            <button
                              type="button"
                              aria-label={`Abrir la cadena: ${h.summary}`}
                              onClick={() => openChain(h.chainId)}
                              className="flex w-full cursor-pointer flex-col gap-1 rounded-card px-2 py-2 text-left transition-colors hover:bg-white/10"
                            >
                              <span className="text-small">{h.summary}</span>
                              <span className="flex flex-wrap items-center gap-x-3 text-tiny text-ink-3">
                                <span>
                                  {kindLabel[h.kind]} {verb} {firstName(agentById(h[other]).name)} · {departmentMeta[h[otherDept]].label}
                                </span>
                                <span>{h.time}</span>
                                <ResolvedStatusText handoff={h} />
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </section>

              <section aria-labelledby="dept-activity" className="flex flex-col gap-3">
                <h3 id="dept-activity" className="text-h2">
                  Actividad reciente
                </h3>
                <ul className="flex flex-col">
                  {recent.map((item) => (
                    <li
                      key={item.id}
                      className="flex flex-wrap gap-x-4 border-b border-glass-border py-2 text-small last:border-b-0"
                    >
                      <span className="w-24 shrink-0 text-ink-3">{item.time}</span>
                      <span className="min-w-0 flex-1">{item.text}</span>
                    </li>
                  ))}
                </ul>
              </section>
            </div>
          </motion.div>
        </MotionGlassPanel>
      </div>
    </>
  );
}
