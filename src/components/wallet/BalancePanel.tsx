"use client";

import { motion } from "framer-motion";
import { Coins } from "lucide-react";
import { useState } from "react";
import { GlassInput, GlassPanel, PillButton } from "@/components/glass";
import { useApprovals } from "@/components/ApprovalsProvider";
import { fmtEur, fmtNumber } from "@/lib/format";
import { CREDITS_PER_EUR, topUpAmounts } from "@/data/wallet";

type Choice = (typeof topUpAmounts)[number] | "other";

export function BalancePanel() {
  const { balance, topUp } = useApprovals();
  const [choice, setChoice] = useState<Choice>(50);
  const [other, setOther] = useState("");
  const [notice, setNotice] = useState("");

  const amount = choice === "other" ? Number(other) : choice;
  const valid = Number.isFinite(amount) && amount >= 5 && amount <= 1000;

  function recharge() {
    if (!valid) return;
    const credits = Math.round(amount * CREDITS_PER_EUR);
    topUp(credits);
    setNotice(`Recarga de ${fmtEur(amount)} realizada: +${fmtNumber(credits)} créditos.`);
  }

  return (
    <GlassPanel as="section" aria-labelledby="balance-title" className="enter flex flex-col gap-6 p-6">
      <div>
        <h2 id="balance-title" className="flex items-center gap-2 text-small text-ink-2">
          <Coins size={16} aria-hidden="true" />
          Saldo actual
        </h2>
        <motion.p
          key={balance}
          initial={{ opacity: 0.4, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          className="mt-2 text-[48px] leading-none font-semibold"
        >
          {fmtNumber(balance)} <span className="text-h2 font-normal text-ink-2">créditos</span>
        </motion.p>
        <p className="mt-2 text-small text-ink-2">
          ≈ {fmtEur(balance / CREDITS_PER_EUR)} · 1 € = {CREDITS_PER_EUR} créditos
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <h3 className="text-body font-semibold">Recargar</h3>
        <div role="group" aria-label="Importe de la recarga" className="flex flex-wrap gap-2">
          {topUpAmounts.map((n) => (
            <PillButton key={n} active={choice === n} onClick={() => setChoice(n)}>
              {n} €
            </PillButton>
          ))}
          <PillButton active={choice === "other"} onClick={() => setChoice("other")}>
            Otro
          </PillButton>
        </div>
        {choice === "other" && (
          <GlassInput
            type="number"
            inputMode="decimal"
            min={5}
            max={1000}
            aria-label="Importe en euros (de 5 a 1.000)"
            placeholder="Importe en € (de 5 a 1.000)"
            value={other}
            onChange={(e) => setOther(e.target.value)}
            className="max-w-xs"
          />
        )}
        <div>
          <PillButton active aria-pressed={undefined} disabled={!valid} onClick={recharge}>
            {valid ? `Recargar ${fmtEur(amount)}` : "Recargar"}
          </PillButton>
        </div>
        <p role="status" className="min-h-5 text-small text-status-working">
          {notice}
        </p>
      </div>
    </GlassPanel>
  );
}
