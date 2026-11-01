"use client";

import { Check, Coins, Pencil, X } from "lucide-react";
import { useState } from "react";
import { Avatar, GlassCard, PillButton } from "@/components/glass";
import { useApprovals } from "@/components/ApprovalsProvider";
import type { OfficeAgent } from "@/data/departments";
import type { Approval } from "@/data/approvals";

export function ApprovalCard({ approval, agent, delay }: { approval: Approval; agent: OfficeAgent; delay: number }) {
  const { edits, decide, edit } = useApprovals();
  const { preview } = approval;
  const body = edits[approval.id] ?? preview.body;
  const edited = approval.id in edits;

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(body);

  return (
    <GlassCard
      department={approval.departmentId}
      delay={delay}
      tag={`~${approval.costCredits.toLocaleString("es-ES", { minimumFractionDigits: 1 })} créditos`}
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="inline-flex items-center gap-1.5">
            <Coins size={14} aria-hidden="true" />
            Coste estimado: {approval.costCredits.toLocaleString("es-ES", { minimumFractionDigits: 1 })} créditos
          </span>
          <div className="flex flex-wrap gap-2">
            {editing ? (
              <>
                <PillButton
                  icon={Check}
                  active
                  aria-pressed={undefined}
                  onClick={() => {
                    edit(approval.id, draft.trim() || body);
                    setEditing(false);
                  }}
                >
                  Guardar cambios
                </PillButton>
                <PillButton onClick={() => setEditing(false)}>Cancelar</PillButton>
              </>
            ) : (
              <>
                <PillButton icon={Check} active aria-pressed={undefined} onClick={() => decide(approval.id, "approved")}>
                  Aprobar
                </PillButton>
                <PillButton
                  icon={Pencil}
                  onClick={() => {
                    setDraft(body);
                    setEditing(true);
                  }}
                >
                  Editar
                </PillButton>
                <PillButton icon={X} onClick={() => decide(approval.id, "rejected")}>
                  Rechazar
                </PillButton>
              </>
            )}
          </div>
        </div>
      }
    >
      <div className="flex items-center gap-3">
        <Avatar name={agent.name} tone={approval.departmentId} status={agent.status} />
        <div className="min-w-0 flex-1">
          <p className="text-small font-semibold">{agent.name}</p>
          <p className="text-tiny text-ink-2">
            {agent.role} · {approval.requested}
          </p>
        </div>
      </div>

      <div>
        <p className="text-tiny text-ink-3">Quiere</p>
        <h3 className="text-h2">{approval.title}</h3>
        <p className="text-small text-ink-2">{approval.detail}</p>
      </div>

      <div className="flex flex-col gap-3 rounded-card bg-black/25 p-4">
        <p className="flex items-center gap-2 text-tiny text-ink-2">
          {preview.label}
          {edited && <span className="rounded-pill bg-accent/40 px-2 py-0.5 text-white">Editado</span>}
        </p>
        <dl className="flex flex-col gap-1 text-small">
          {preview.fields.map((f) => (
            <div key={f.label} className="flex flex-wrap gap-x-2">
              <dt className="text-ink-3">{f.label}:</dt>
              <dd>{f.value}</dd>
            </div>
          ))}
        </dl>
        {editing ? (
          <textarea
            aria-label={`Editar ${preview.label.toLowerCase()}`}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={8}
            className="w-full resize-y rounded-card border border-glass-border bg-black/30 p-3 text-small text-white outline-none focus-visible:outline-2 focus-visible:outline-white"
          />
        ) : (
          <p className="text-small whitespace-pre-line">{body}</p>
        )}
      </div>
    </GlassCard>
  );
}
