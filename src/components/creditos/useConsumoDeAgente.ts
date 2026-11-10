"use client";

import { useCreditos } from "./CreditosProvider";

/** Créditos gastados este mes por un agente (real, del resumen). 0 si no ha gastado; null mientras carga. Se enlaza por nombre. */
export function useConsumoDeAgente(nombre: string): number | null {
  const { resumen } = useCreditos();
  if (!resumen) return null;
  return resumen.consumoMes.porAgente.find((a) => a.nombre === nombre)?.creditos ?? 0;
}
