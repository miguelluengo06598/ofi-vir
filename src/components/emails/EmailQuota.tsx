"use client";

import { Mail } from "lucide-react";
import { useApprovals } from "@/components/ApprovalsProvider";
import { EMAIL_DAILY_LIMIT, emailsToday } from "@/data/emails";

/** «Correos hoy: 12 de 50»: límite diario de envíos del agente. */
export function EmailQuota({ agentId }: { agentId: string }) {
  const { decisions } = useApprovals();
  const sent = emailsToday(agentId, decisions);
  const pct = Math.min(100, (sent / EMAIL_DAILY_LIMIT) * 100);
  const left = EMAIL_DAILY_LIMIT - sent;
  const bar = pct >= 100 ? "bg-status-error" : pct >= 80 ? "bg-status-waiting" : "bg-accent";
  return (
    <div className="flex flex-col gap-2">
      <p className="flex items-center gap-2 text-small">
        <Mail size={16} aria-hidden="true" />
        Correos hoy: {sent} de {EMAIL_DAILY_LIMIT}
      </p>
      <div
        role="progressbar"
        aria-label="Correos enviados hoy"
        aria-valuemin={0}
        aria-valuemax={EMAIL_DAILY_LIMIT}
        aria-valuenow={sent}
        aria-valuetext={`${sent} de ${EMAIL_DAILY_LIMIT} correos`}
        className="h-2 overflow-hidden rounded-full bg-white/15"
      >
        <div className={`h-full rounded-full ${bar}`} style={{ width: `${pct}%` }} />
      </div>
      <p className="text-tiny text-ink-2">
        {left <= 0 ? "Límite diario alcanzado: no enviará más hasta mañana." : `Puede enviar ${left} más hoy (límite diario de ${EMAIL_DAILY_LIMIT}).`}
      </p>
    </div>
  );
}
