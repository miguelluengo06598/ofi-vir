"use client";

/**
 * Diálogo de confirmación de las acciones sobre un cliente: título, explicación, campos propios, motivo obligatorio y
 * botón de confirmar. Llama a la acción de servidor, muestra su error o cierra y refresca la página.
 */
import { AnimatePresence, motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { MotionGlassPanel, PillButton } from "@/components/glass";
import { useFocusTrap } from "@/lib/useFocusTrap";

export type Resultado = { ok: true } | { ok: false; mensaje: string };

export const campo = "w-full rounded-card border border-glass-border bg-black/25 px-3 py-2 text-small text-white placeholder:text-ink-3 focus-visible:outline-2 focus-visible:outline-white";
export const etiqueta = "flex flex-col gap-1 text-small text-ink-2";

type Props = {
  abierto: boolean;
  onCerrar: () => void;
  titulo: string;
  explicacion: React.ReactNode;
  /** Campos propios de la acción (controlados por el llamante). */
  children?: React.ReactNode;
  etiquetaConfirmar: string;
  peligro?: boolean;
  /** Sin motivo no se puede confirmar. Si se pide, se pasa a `onConfirmar`. */
  pedirMotivo?: boolean;
  listo?: boolean;
  onConfirmar: (motivo: string) => Promise<Resultado>;
  /** Tras confirmar bien: por defecto cierra y refresca. Devuelve false para dejarlo abierto (p. ej. para mostrar un enlace). */
  alTerminar?: (r: Resultado) => boolean | void;
};

function Contenido({ onCerrar, titulo, explicacion, children, etiquetaConfirmar, peligro, pedirMotivo = true, listo = true, onConfirmar, alTerminar }: Omit<Props, "abierto">) {
  const panel = useRef<HTMLElement>(null);
  const id = useId();
  const router = useRouter();
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, iniciar] = useTransition();
  useFocusTrap(panel);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !enviando) { e.stopPropagation(); onCerrar(); } };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [onCerrar, enviando]);

  const motivoValido = !pedirMotivo || motivo.trim().length >= 3;
  const confirmar = () => iniciar(async () => {
    setError(null);
    const r = await onConfirmar(motivo.trim());
    if (!r.ok) { setError(r.mensaje); return; }
    const seguir = alTerminar?.(r);
    router.refresh();
    if (seguir !== false) onCerrar();
  });

  return (
    <>
      <motion.div aria-hidden="true" className="fixed inset-0 z-[80] bg-black/55" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => !enviando && onCerrar()} />
      <div className="pointer-events-none fixed inset-0 z-[90] flex items-center justify-center p-4">
        <MotionGlassPanel
          ref={panel} role="dialog" aria-modal="true" aria-labelledby={`${id}-t`} aria-describedby={`${id}-d`}
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }} transition={{ duration: 0.25, ease: "easeOut" }}
          className="pointer-events-auto flex max-h-[90vh] w-full max-w-lg flex-col gap-4 overflow-y-auto p-6"
        >
          <h2 id={`${id}-t`} className="text-h2">{titulo}</h2>
          <div id={`${id}-d`} className="flex flex-col gap-2 text-small text-ink-2">{explicacion}</div>
          {children}
          {pedirMotivo && (
            <label className={etiqueta}>
              Motivo (obligatorio, queda en el registro de auditoría)
              <textarea className={`${campo} min-h-20`} value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={1000} required />
            </label>
          )}
          {error && <p role="alert" className="text-small text-status-error">{error}</p>}
          <div className="flex flex-wrap justify-end gap-2">
            <PillButton onClick={onCerrar} disabled={enviando}>Cancelar</PillButton>
            <PillButton active aria-pressed={undefined} onClick={confirmar} disabled={enviando || !motivoValido || !listo}
              className={peligro ? "border-status-error/70! bg-status-error/35!" : ""}>
              {enviando ? "Un momento…" : etiquetaConfirmar}
            </PillButton>
          </div>
        </MotionGlassPanel>
      </div>
    </>
  );
}

export function Dialogo({ abierto, ...resto }: Props) {
  return <AnimatePresence>{abierto && <Contenido key="dialogo" {...resto} />}</AnimatePresence>;
}
