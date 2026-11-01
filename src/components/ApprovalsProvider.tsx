"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { approvals } from "@/data/approvals";
import { hiredAgentId, type HiredAgent } from "@/data/departments";
import type { DepartmentId } from "@/components/glass";
import { initialBalance, initialMonthlyLimitEur } from "@/data/wallet";

export type Decision = { approvalId: string; decision: "approved" | "rejected" };

type ApprovalsContextValue = {
  decisions: Decision[];
  /** Ids de aprobaciones ya resueltas. */
  resolved: ReadonlySet<string>;
  /** Textos editados por el usuario, por id de aprobación. */
  edits: Record<string, string>;
  pendingCount: number;
  /** Saldo de créditos, en créditos. */
  balance: number;
  /** Límite de gasto mensual, en euros. */
  limitEur: number;
  topUp: (credits: number) => void;
  setLimit: (eur: number) => void;
  /** Agentes del marketplace contratados. */
  hired: HiredAgent[];
  /** Id del agente recién contratado cuya llegada a la oficina aún se está animando. */
  arrival: string | null;
  hire: (marketId: string, departmentId: DepartmentId) => void;
  finishArrival: () => void;
  decide: (approvalId: string, decision: Decision["decision"]) => void;
  edit: (approvalId: string, body: string) => void;
};

const ApprovalsContext = createContext<ApprovalsContextValue | null>(null);

/** Estado compartido (simulado) de las aprobaciones: lo usan Oficina, Mensajes, Aprobaciones y la TopBar. */
export function ApprovalsProvider({ children }: { children: ReactNode }) {
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [hired, setHired] = useState<HiredAgent[]>([]);
  const [balance, setBalance] = useState(initialBalance);
  const [limitEur, setLimitEur] = useState(initialMonthlyLimitEur);
  const [arrival, setArrival] = useState<string | null>(null);

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

  const hire = useCallback((marketId: string, departmentId: DepartmentId) => {
    setHired((h) => (h.some((x) => x.marketId === marketId) ? h : [...h, { marketId, departmentId }]));
    setArrival(hiredAgentId(marketId));
  }, []);
  const topUp = useCallback((credits: number) => setBalance((b) => b + credits), []);
  const setLimit = useCallback((eur: number) => setLimitEur(eur), []);
  const finishArrival = useCallback(() => setArrival(null), []);

  const value = useMemo(
    () => ({
      decisions,
      resolved,
      edits,
      pendingCount: approvals.filter((a) => !resolved.has(a.id)).length,
      balance,
      limitEur,
      topUp,
      setLimit,
      hired,
      arrival,
      hire,
      finishArrival,
      decide,
      edit,
    }),
    [decisions, resolved, edits, balance, limitEur, topUp, setLimit, hired, arrival, hire, finishArrival, decide, edit],
  );

  return <ApprovalsContext.Provider value={value}>{children}</ApprovalsContext.Provider>;
}

export function useApprovals() {
  const ctx = useContext(ApprovalsContext);
  if (!ctx) throw new Error("useApprovals debe usarse dentro de ApprovalsProvider");
  return ctx;
}
