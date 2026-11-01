"use client";

import { AnimatePresence } from "framer-motion";
import { PartyPopper } from "lucide-react";
import { useRouter } from "next/navigation";
import { GlassPanel, PillButton } from "@/components/glass";
import { useApprovals } from "@/components/ApprovalsProvider";
import { approvals } from "@/data/approvals";
import { ApprovalCard } from "./ApprovalCard";

export function ApprovalsView() {
  const router = useRouter();
  const { resolved, office, pendingCount } = useApprovals();
  const agents = office.summaries.flatMap((s) => s.agents);
  const pending = approvals.filter((a) => !resolved.has(a.id));

  return (
    <div className="flex flex-1 flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-h1">Aprobaciones</h1>
        <p className="text-body text-ink-2" aria-live="polite">
          {pendingCount === 0
            ? "Todo al día"
            : `${pendingCount} ${pendingCount === 1 ? "petición espera" : "peticiones esperan"} tu decisión`}
        </p>
      </div>

      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4">
        <h2 className="sr-only">Peticiones pendientes</h2>
        <AnimatePresence>
          {pending.map((a, i) => (
            <ApprovalCard
              key={a.id}
              approval={a}
              agent={agents.find((x) => x.id === a.agentId)!}
              delay={0.05 + i * 0.08}
            />
          ))}
        </AnimatePresence>

        {pending.length === 0 && (
          <div className="enter my-auto" style={{ "--enter-delay": "0.3s" } as React.CSSProperties}>
            <GlassPanel className="flex flex-col items-center gap-3 px-8 py-12 text-center">
              <PartyPopper size={40} aria-hidden="true" />
              <h2 className="text-h2">Todo al día</h2>
              <p className="max-w-sm text-body text-ink-2">
                No tienes nada pendiente de aprobar. Tus agentes siguen trabajando y te avisarán cuando necesiten tu visto bueno.
              </p>
              <PillButton onClick={() => router.push("/")}>Volver a la oficina</PillButton>
            </GlassPanel>
          </div>
        )}
      </div>
    </div>
  );
}
