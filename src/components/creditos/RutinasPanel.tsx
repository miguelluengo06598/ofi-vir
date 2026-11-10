"use client";

import { useCreditos } from "./CreditosProvider";
import { Seccion, Vacio } from "./partes";
import { NOMBRE_FRECUENCIA, NOMBRE_TIPO_TAREA, creditosAEur } from "@/lib/creditos/tipos";
import { fmtEur, fmtNumber } from "@/lib/format";

export function RutinasPanel() {
  const { resumen } = useCreditos();
  if (!resumen) return null;
  const { rutinas } = resumen;
  return (
    <Seccion id="rutinas" titulo="Rutinas activas" acciones={rutinas.activas > 0 ? <p className="text-small text-ink-2">Coste estimado: <strong className="text-white">{fmtNumber(rutinas.costeMensualEstimado)} créditos/mes</strong> (≈ {fmtEur(creditosAEur(rutinas.costeMensualEstimado))})</p> : undefined}>
      {rutinas.activas === 0 ? <Vacio>No hay rutinas activas. Cuando actives una, verás aquí cuántos créditos gastará al mes.</Vacio> : (
        <ul className="flex flex-col gap-2">
          {rutinas.detalle.map((r) => (
            <li key={r.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 rounded-card bg-white/6 p-3 text-small">
              <span className="min-w-0">
                <span className="font-semibold">{r.nombre}</span>
                <span className="block text-tiny text-ink-3">Tarea {NOMBRE_TIPO_TAREA[r.tipoTarea].toLowerCase()} · {NOMBRE_FRECUENCIA[r.frecuencia] ?? r.frecuencia}</span>
              </span>
              <span className="shrink-0 font-semibold">≈ {fmtNumber(r.costeMensualEstimado)} créditos/mes</span>
            </li>
          ))}
        </ul>
      )}
    </Seccion>
  );
}
