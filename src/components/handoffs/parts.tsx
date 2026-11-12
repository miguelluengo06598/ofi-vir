"use client";

import { ArrowRight } from "lucide-react";
import { useApprovals } from "@/components/ApprovalsProvider";
import { Avatar } from "@/components/glass";
import { handoffStatusLabel, type Handoff, type HandoffStatus } from "@/data/handoffs";

const dot: Record<HandoffStatus, string> = {
  sent: "bg-status-paused",
  received: "bg-accent",
  inProgress: "bg-status-waiting",
  done: "bg-status-working",
  rejected: "bg-status-error",
};

/** Estado del traspaso: punto + texto (nunca solo color). */
export function HandoffStatusText({ status }: { status: HandoffStatus }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-tiny text-ink-2">
      <span aria-hidden="true" className={`size-2 rounded-full ${dot[status]}`} />
      {handoffStatusLabel[status]}
    </span>
  );
}

/** Nombre de un agente de la oficina por su id (en la oficina real y en las demos). Nunca falla: «Agente» si no está. */
export function useAgenteDe() {
  const { agente } = useApprovals();
  return (id: string) => agente(id) ?? { id, name: "Agente", departmentId: "ventas" as const };
}

/** Avatares de origen y destino con una flecha. */
export function HandoffPair({ handoff, size = 28 }: { handoff: Handoff; size?: number }) {
  const agenteDe = useAgenteDe();
  const from = agenteDe(handoff.fromAgentId);
  const to = agenteDe(handoff.toAgentId);
  return (
    <span className="inline-flex shrink-0 items-center gap-1">
      <Avatar name={from.name} tone={handoff.fromDepartmentId} size={size} />
      <ArrowRight size={14} aria-hidden="true" className="text-ink-3" />
      <Avatar name={to.name} tone={handoff.toDepartmentId} size={size} />
    </span>
  );
}

/** Estado de un traspaso: si genera una aprobación ya resuelta, aprobado → completado y rechazado → rechazado. */
export function useResolvedStatus(handoff: Handoff): HandoffStatus {
  const { decisions } = useApprovals();
  const decision = decisions.find((d) => d.approvalId === handoff.approvalId)?.decision;
  return decision === "approved" ? "done" : decision === "rejected" ? "rejected" : handoff.status;
}

export function ResolvedStatusText({ handoff }: { handoff: Handoff }) {
  return <HandoffStatusText status={useResolvedStatus(handoff)} />;
}
