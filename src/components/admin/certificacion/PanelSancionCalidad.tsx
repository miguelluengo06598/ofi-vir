"use client";

import { AlertTriangle, BadgeAlert, GraduationCap, ShieldOff } from "lucide-react";
import { useState } from "react";
import { aplicarSancionDeCalidad } from "@/app/(admin)/admin/certificacion/acciones";

const OPCIONES = [
  { id: "warning", label: "Aviso a la empresa", Icon: AlertTriangle },
  { id: "recertification", label: "Recertificación obligatoria", Icon: GraduationCap },
  { id: "suspension", label: "Suspender agente", Icon: BadgeAlert },
  { id: "certification_withdrawal", label: "Retirar certificación", Icon: ShieldOff },
] as const;

export function PanelSancionCalidad({ companyId, agentId }: { companyId: string; agentId: string }) {
  const [kind, setKind] = useState<(typeof OPCIONES)[number]["id"]>("warning");
  const [reason, setReason] = useState(""); const [due, setDue] = useState(""); const [message, setMessage] = useState(""); const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true); setMessage("");
    const r = await aplicarSancionDeCalidad({ companyId, agentId, kind, reason, ...(kind === "recertification" && due ? { dueAt: new Date(`${due}T12:00:00Z`).toISOString() } : {}) });
    setMessage(r.ok ? "Medida registrada y empresa avisada." : r.mensaje); setBusy(false);
  };
  return <div className="flex flex-wrap items-end gap-2 rounded-card border border-glass-border bg-black/20 p-3">
    <label className="flex min-w-44 flex-1 flex-col gap-1 text-tiny text-ink-2">Medida
      <select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} className="rounded-pill bg-black/30 px-3 py-2 text-small text-white">
        {OPCIONES.map(({ id, label }) => <option key={id} value={id} className="text-black">{label}</option>)}
      </select>
    </label>
    {kind === "recertification" && <label className="flex flex-col gap-1 text-tiny text-ink-2">Plazo <input type="date" value={due} onChange={(e) => setDue(e.target.value)} className="rounded-pill bg-black/30 px-3 py-2 text-small" /></label>}
    <label className="flex min-w-56 flex-[2] flex-col gap-1 text-tiny text-ink-2">Motivo para la empresa
      <input value={reason} maxLength={2000} onChange={(e) => setReason(e.target.value)} className="rounded-pill bg-black/30 px-3 py-2 text-small" />
    </label>
    <button type="button" disabled={busy || !reason.trim() || (kind === "recertification" && !due)} onClick={() => void submit()} className="glass glass-interactive cursor-pointer rounded-pill px-4 py-2 text-small disabled:cursor-not-allowed disabled:opacity-50">{busy ? "Aplicando…" : "Aplicar"}</button>
    {message && <p role="status" className="basis-full text-small text-ink-2">{message}</p>}
  </div>;
}
