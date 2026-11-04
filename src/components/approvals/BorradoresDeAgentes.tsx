"use client";

import { Check, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { aprobarBorradorDeAgente, borradoresDeAgentes, rechazarBorradorDeAgente } from "@/app/actions/agentes";
import type { PendingDraft } from "@/lib/agents/supabaseStore";
import { GlassPanel, PillButton } from "@/components/glass";

/**
 * Correos que han redactado los agentes (motor real) y esperan tu aprobación. Se aprueba el texto exacto que ves:
 * al aprobar, la base registra quién, cuándo y la huella de ese texto, y solo entonces se envía.
 */
export function BorradoresDeAgentes() {
  const [drafts, setDrafts] = useState<PendingDraft[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [done, setDone] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setDrafts(await borradoresDeAgentes());
    } catch {
      /* sin conexión: se reintenta en el siguiente ciclo */
    }
  }, []);

  useEffect(() => {
    const first = setTimeout(load, 0);
    const t = setInterval(load, 5000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [load]);

  const decide = async (d: PendingDraft, accion: "aprobar" | "rechazar") => {
    setBusy(d.approvalId);
    setDone(null);
    setErrors((e) => ({ ...e, [d.approvalId]: "" }));
    try {
      const r = accion === "aprobar" ? await aprobarBorradorDeAgente({ approvalId: d.approvalId }) : await rechazarBorradorDeAgente({ approvalId: d.approvalId });
      if (r.estado === "error") setErrors((e) => ({ ...e, [d.approvalId]: r.mensaje }));
      else setDone(r.estado === "enviado" ? `Correo enviado a ${d.toEmail}.` : "Borrador rechazado.");
      await load();
    } catch {
      setErrors((e) => ({ ...e, [d.approvalId]: "No se pudo contactar con el servidor." }));
    } finally {
      setBusy(null);
    }
  };

  if (drafts.length === 0 && !done) return null;
  return (
    <section aria-label="Borradores redactados por agentes" className="flex flex-col gap-3">
      <h2 className="text-h2">Borradores de tus agentes</h2>
      <p role="status" className="text-small text-ink-2">
        {done ?? `${drafts.length} ${drafts.length === 1 ? "correo espera" : "correos esperan"} tu aprobación. Nada sale sin ella.`}
      </p>
      {drafts.map((d) => (
        <GlassPanel key={d.approvalId} className="flex flex-col gap-3 p-5">
          <p className="text-tiny text-ink-3">Redactado por {d.agentName} · pendiente de aprobación</p>
          <p className="text-small">
            <span className="text-ink-3">Para: </span>
            {d.toName} &lt;{d.toEmail}&gt;
          </p>
          <p className="text-body font-semibold">{d.subject}</p>
          <p className="whitespace-pre-wrap break-words text-small text-ink-2">{d.body}</p>
          {errors[d.approvalId] && (
            <p role="alert" className="text-small">
              {errors[d.approvalId]}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <PillButton icon={Check} disabled={busy !== null} onClick={() => decide(d, "aprobar")} active>
              {busy === d.approvalId ? "Enviando…" : "Aprobar y enviar"}
            </PillButton>
            <PillButton icon={X} disabled={busy !== null} onClick={() => decide(d, "rechazar")}>
              Rechazar
            </PillButton>
          </div>
        </GlassPanel>
      ))}
    </section>
  );
}
