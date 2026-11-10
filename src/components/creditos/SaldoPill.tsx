"use client";

import { Coins } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCreditos } from "./CreditosProvider";
import { ESTADOS_OFICINA } from "@/lib/creditos/tipos";
import { fmtNumber } from "@/lib/format";

const TONO = {
  ok: "",
  aviso: "border-status-waiting! bg-status-waiting/25!",
  error: "border-status-error! bg-status-error/25!",
  neutro: "",
} as const;

/** Píldora con el saldo en la barra superior: lleva a Créditos y cambia de color con saldo bajo o sin saldo. */
export function SaldoPill() {
  const { resumen } = useCreditos();
  const router = useRouter();
  if (!resumen) return null;
  const e = ESTADOS_OFICINA[resumen.estadoOficina.estado];
  const texto = `${fmtNumber(resumen.saldo.disponible)} créditos`;
  return (
    <button
      type="button"
      onClick={() => router.push("/creditos")}
      aria-label={`Saldo: ${texto}. Oficina ${e.etiqueta.toLowerCase()}. Ir a Créditos`}
      className={`glass glass-interactive inline-flex cursor-pointer items-center gap-2 rounded-pill px-3 py-2 text-small text-white ${TONO[e.tono]}`}
    >
      <Coins size={16} aria-hidden="true" className="shrink-0" />
      <span>{fmtNumber(resumen.saldo.disponible)}</span>
      {e.tono !== "ok" && <span className="hidden text-tiny font-semibold sm:inline">· {e.etiqueta}</span>}
    </button>
  );
}
