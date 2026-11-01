"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { approvals } from "@/data/approvals";

export type Decision = { approvalId: string; decision: "approved" | "rejected" };

type ApprovalsContextValue = {
  decisions: Decision[];
  /** Ids de aprobaciones ya resueltas. */
  resolved: ReadonlySet<string>;
  /** Textos editados por el usuario, por id de aprobación. */
  edits: Record<string, string>;
  pendingCount: number;
  decide: (approvalId: string, decision: Decision["decision"]) => void;
  edit: (approvalId: string, body: string) => void;
};

const ApprovalsContext = createContext<ApprovalsContextValue | null>(null);

/** Estado compartido (simulado) de las aprobaciones: lo usan Oficina, Mensajes, Aprobaciones y la TopBar. */
export function ApprovalsProvider({ children }: { children: ReactNode }) {
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [edits, setEdits] = useState<Record<string, string>>({});

  const resolved = useMemo(() => new Set(decisions.map((d) => d.approvalId)), [decisions]);
  const decide = useCallback(
    (approvalId: string, decision: Decision["decision"]) =>
      setDecisions((d) => (d.some((x) => x.approvalId === approvalId) ? d : [...d, { approvalId, decision }])),
    [],
  );
  const edit = useCallback(
    (approvalId: string, body: string) => setEdits((e) => ({ ...e, [approvalId]: body })),
    [],
  );

  const value = useMemo(
    () => ({
      decisions,
      resolved,
      edits,
      pendingCount: approvals.filter((a) => !resolved.has(a.id)).length,
      decide,
      edit,
    }),
    [decisions, resolved, edits, decide, edit],
  );

  return <ApprovalsContext.Provider value={value}>{children}</ApprovalsContext.Provider>;
}

export function useApprovals() {
  const ctx = useContext(ApprovalsContext);
  if (!ctx) throw new Error("useApprovals debe usarse dentro de ApprovalsProvider");
  return ctx;
}
