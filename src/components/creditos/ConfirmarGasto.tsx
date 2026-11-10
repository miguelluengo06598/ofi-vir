"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useId, useRef } from "react";
import { MotionGlassPanel, PillButton } from "@/components/glass";
import { creditosAEur } from "@/lib/creditos/tipos";
import { fmtEur, fmtNumber } from "@/lib/format";
import { useFocusTrap } from "@/lib/useFocusTrap";

type Props = {
  abierto: boolean;
  /** Qué se va a hacer, en una frase («Lanzar una tarea experta»). */
  titulo: string;
  creditos: number;
  /** Saldo actual: si no alcanza, se avisa y no se puede confirmar. */
  saldo?: number | null;
  nota?: string;
  etiquetaConfirmar?: string;
  onConfirmar: () => void;
  onCancelar: () => void;
};

function Contenido({ titulo, creditos, saldo, nota, etiquetaConfirmar = "Confirmar", onConfirmar, onCancelar }: Omit<Props, "abierto">) {
  const dialog = useRef<HTMLElement>(null);
  const id = useId();
  useFocusTrap(dialog);
  const sinSaldo = saldo != null && saldo < creditos;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      onCancelar();
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [onCancelar]);

  return (
    <>
      <motion.div aria-hidden="true" className="fixed inset-0 z-[80] bg-black/50" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onCancelar} />
      <div className="pointer-events-none fixed inset-0 z-[90] flex items-center justify-center p-4">
        <MotionGlassPanel
          ref={dialog}
          role="alertdialog"
          aria-modal="true"
          aria-labelledby={`${id}-t`}
          aria-describedby={`${id}-d`}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 12 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          className="pointer-events-auto flex w-full max-w-md flex-col gap-4 p-6"
        >
          <h2 id={`${id}-t`} className="text-h2">{titulo}</h2>
          <div id={`${id}-d`} className="flex flex-col gap-2">
            <p className="text-body">
              Esto gastará <strong>{fmtNumber(creditos)} créditos</strong> (≈ {fmtEur(creditosAEur(creditos))}).
            </p>
            {saldo != null && <p className="text-small text-ink-2">Saldo actual: {fmtNumber(saldo)} créditos.</p>}
            {nota && <p className="text-small text-ink-2">{nota}</p>}
            {sinSaldo && <p role="alert" className="text-small text-status-error">No tienes saldo suficiente. Compra créditos en la vista Créditos.</p>}
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <PillButton onClick={onCancelar}>Cancelar</PillButton>
            <PillButton active aria-pressed={undefined} disabled={sinSaldo} onClick={onConfirmar}>{etiquetaConfirmar}</PillButton>
          </div>
        </MotionGlassPanel>
      </div>
    </>
  );
}

/** «Esto gastará X créditos (≈ Y €)»: se muestra antes de lanzar a mano una tarea de pago o activar una rutina. */
export function ConfirmarGasto({ abierto, ...resto }: Props) {
  return <AnimatePresence>{abierto && <Contenido key="confirmar" {...resto} />}</AnimatePresence>;
}
