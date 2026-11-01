"use client";

import { AnimatePresence, motion } from "framer-motion";
import { LifeBuoy, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { useApprovals } from "@/components/ApprovalsProvider";
import { Avatar, MotionGlassPanel, PillButton } from "@/components/glass";
import { expertFor } from "@/data/experts";
import { fmtNumber } from "@/lib/format";
import { useFocusTrap } from "@/lib/useFocusTrap";

const MIN_PROBLEM = 15;

function Form({ agentId }: { agentId: string }) {
  const { office, balance, consult, closeConsult } = useApprovals();
  const agent = office.summaries.flatMap((s) => s.agents).find((a) => a.id === agentId)!;
  const expert = expertFor(agent.creator)!;

  const [problem, setProblem] = useState("");
  const [consent, setConsent] = useState(false);
  const dialog = useRef<HTMLElement>(null);
  const id = useId();
  useFocusTrap(dialog);

  const enoughBalance = balance >= expert.price;
  const valid = problem.trim().length >= MIN_PROBLEM && consent && enoughBalance;
  const first = agent.name.split(" ")[0];

  // Escape en fase de captura: cierra solo este diálogo y no los que haya debajo.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      closeConsult();
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [closeConsult]);

  return (
    <>
      <motion.div
        aria-hidden="true"
        className="fixed inset-0 z-[80] bg-black/50"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={closeConsult}
      />
      <div className="pointer-events-none fixed inset-0 z-[90] flex items-center justify-center p-4">
        <MotionGlassPanel
          ref={dialog}
          role="dialog"
          aria-modal="true"
          aria-labelledby={`${id}-title`}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 12 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          className="pointer-events-auto flex max-h-full w-full max-w-lg flex-col gap-5 overflow-y-auto p-6"
        >
          <form
            className="flex flex-col gap-5"
            onSubmit={(e) => {
              e.preventDefault();
              if (!valid) return;
              consult(agentId, problem.trim());
              closeConsult();
            }}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <Avatar name={expert.name} tone={agent.departmentId} size={48} />
                <div>
                  <h2 id={`${id}-title`} className="flex items-center gap-2 text-h2">
                    <LifeBuoy size={18} aria-hidden="true" className="text-status-expert" />
                    Consultar al experto
                  </h2>
                  <p className="text-small text-ink-2">
                    {expert.name}, {expert.title} de {first} · {expert.company}
                  </p>
                </div>
              </div>
              <PillButton icon={X} aria-label="Cerrar" onClick={closeConsult} />
            </div>

            <div className="flex flex-col gap-2">
              <label htmlFor={`${id}-problem`} className="text-small font-semibold">
                Describe el problema
              </label>
              <textarea
                id={`${id}-problem`}
                autoFocus
                rows={5}
                value={problem}
                onChange={(e) => setProblem(e.target.value)}
                placeholder={`Cuéntale a ${expert.name.split(" ")[0]} qué necesitas y qué ha pasado hasta ahora.`}
                className="w-full resize-y rounded-card border border-glass-border bg-black/30 p-3 text-small text-white outline-none placeholder:text-ink-3 focus-visible:outline-2 focus-visible:outline-white"
              />
              <p className="text-tiny text-ink-3">Mínimo {MIN_PROBLEM} caracteres.</p>
            </div>

            <dl className="grid grid-cols-3 gap-3 rounded-card bg-black/25 p-4 text-center">
              <div>
                <dd className="text-body font-semibold">{expert.price} créditos</dd>
                <dt className="text-tiny text-ink-2">Precio de la consulta</dt>
              </div>
              <div>
                <dd className="text-body font-semibold">~{expert.avgResponseHours} h</dd>
                <dt className="text-tiny text-ink-2">Respuesta estimada</dt>
              </div>
              <div>
                <dd className="text-body font-semibold">{fmtNumber(balance)}</dd>
                <dt className="text-tiny text-ink-2">Tu saldo (créditos)</dt>
              </div>
            </dl>
            {!enoughBalance && (
              <p role="alert" className="text-small text-status-error">
                No tienes créditos suficientes para esta consulta. Recarga tu saldo en Créditos.
              </p>
            )}

            <label className="flex cursor-pointer items-start gap-3 text-small">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                className="mt-0.5 size-5 shrink-0 cursor-pointer accent-[#4F8CFF]"
              />
              Acepto compartir con el experto los datos de este caso
            </label>

            <div className="flex flex-wrap justify-end gap-2">
              <PillButton onClick={closeConsult}>Cancelar</PillButton>
              <PillButton type="submit" active aria-pressed={undefined} disabled={!valid}>
                Enviar consulta · {expert.price} créditos
              </PillButton>
            </div>
          </form>
        </MotionGlassPanel>
      </div>
    </>
  );
}

/** Diálogo global «Consultar al experto»: se abre desde cualquier ficha de agente. */
export function ConsultDialog() {
  const { consultTarget } = useApprovals();
  return <AnimatePresence>{consultTarget && <Form key={consultTarget} agentId={consultTarget} />}</AnimatePresence>;
}
