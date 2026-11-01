"use client";

import { Pencil } from "lucide-react";
import { useState } from "react";
import { GlassInput, GlassPanel, PillButton } from "@/components/glass";
import { useApprovals } from "@/components/ApprovalsProvider";
import { fmtEur } from "@/lib/format";
import { CREDITS_PER_EUR, monthSpent } from "@/data/wallet";

export function LimitPanel() {
  const { limitEur, setLimit } = useApprovals();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  const spentEur = monthSpent / CREDITS_PER_EUR;
  const pct = Math.round((spentEur / limitEur) * 100);
  const state = pct >= 100 ? "error" : pct >= 80 ? "waiting" : "working";
  const bar = { working: "bg-status-working", waiting: "bg-status-waiting", error: "bg-status-error" }[state];
  const hint = {
    working: "Vas dentro del límite.",
    waiting: "Te acercas al límite: tus agentes se pausarán al alcanzarlo.",
    error: "Has alcanzado el límite: tus agentes están en pausa.",
  }[state];

  const draftValue = Number(draft);
  const valid = Number.isFinite(draftValue) && draftValue >= 10 && draftValue <= 10000;

  return (
    <GlassPanel as="section" aria-labelledby="limit-title" className="flex flex-col gap-4 p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="limit-title" className="text-small text-ink-2">
            Límite de gasto mensual
          </h2>
          <p className="mt-1 text-h1">{fmtEur(limitEur)}</p>
        </div>
        {!editing && (
          <PillButton
            icon={Pencil}
            onClick={() => {
              setDraft(String(limitEur));
              setEditing(true);
            }}
          >
            Editar
          </PillButton>
        )}
      </div>

      {editing && (
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!valid) return;
            setLimit(Math.round(draftValue));
            setEditing(false);
          }}
        >
          <GlassInput
            type="number"
            inputMode="numeric"
            min={10}
            max={10000}
            autoFocus
            aria-label="Nuevo límite mensual en euros (de 10 a 10.000)"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="w-40"
          />
          <PillButton type="submit" active aria-pressed={undefined} disabled={!valid}>
            Guardar
          </PillButton>
          <PillButton onClick={() => setEditing(false)}>Cancelar</PillButton>
        </form>
      )}

      <div className="flex flex-col gap-2">
        <div
          role="progressbar"
          aria-label="Gasto del mes sobre el límite"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.min(pct, 100)}
          className="h-2 overflow-hidden rounded-full bg-white/15"
        >
          <div className={`h-full rounded-full transition-[width] duration-300 ${bar}`} style={{ width: `${Math.min(pct, 100)}%` }} />
        </div>
        <p className="text-small">
          {fmtEur(spentEur)} gastados este mes · <span className="font-semibold">{pct} %</span>
        </p>
        <p className="text-small text-ink-2">{hint}</p>
      </div>
    </GlassPanel>
  );
}
