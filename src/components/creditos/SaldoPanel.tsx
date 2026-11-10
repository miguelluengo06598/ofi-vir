"use client";

import { motion } from "framer-motion";
import { AlertTriangle, CheckCircle2, Coins, OctagonAlert } from "lucide-react";
import { useCreditos } from "./CreditosProvider";
import { Seccion } from "./partes";
import { ESTADOS_OFICINA, creditosAEur, tareasEstandar } from "@/lib/creditos/tipos";
import { fmtEur, fmtNumber } from "@/lib/format";

const icono = { ok: CheckCircle2, aviso: AlertTriangle, error: OctagonAlert, neutro: AlertTriangle } as const;
const color = { ok: "text-status-working", aviso: "text-status-waiting", error: "text-status-error", neutro: "text-ink-2" } as const;

export function SaldoPanel() {
  const { resumen } = useCreditos();
  if (!resumen) return null;
  const { saldo, estadoOficina } = resumen;
  const e = ESTADOS_OFICINA[estadoOficina.estado];
  const Icono = icono[e.tono];
  return (
    <Seccion id="saldo" titulo={<span className="flex items-center gap-2 text-small font-normal text-ink-2"><Coins size={16} aria-hidden="true" />Saldo disponible</span>}>
      <div>
        <motion.p
          key={saldo.disponible}
          initial={{ opacity: 0.4, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          className="text-[40px] leading-none font-semibold sm:text-[48px]"
        >
          {fmtNumber(saldo.disponible)} <span className="text-h2 font-normal text-ink-2">créditos</span>
        </motion.p>
        <p className="mt-2 text-small text-ink-2">
          ≈ {fmtNumber(tareasEstandar(saldo.disponible))} tareas estándar · ≈ {fmtEur(creditosAEur(saldo.disponible))}
        </p>
        {saldo.reservado > 0 && <p className="mt-1 text-small text-ink-3">{fmtNumber(saldo.reservado)} créditos reservados por tareas en curso.</p>}
      </div>
      <div className="rounded-card bg-white/6 p-4">
        <p className={`flex items-center gap-2 text-body font-semibold ${color[e.tono]}`}>
          <Icono size={18} aria-hidden="true" />
          <span className="text-white">Oficina: </span>{e.etiqueta}
        </p>
        <p className="mt-1 text-small text-ink-2">{e.significa}</p>
        <p className="mt-1 text-small">{e.hacer}</p>
      </div>
    </Seccion>
  );
}
