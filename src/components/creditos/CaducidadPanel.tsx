"use client";

import { useState } from "react";
import { TriangleAlert } from "lucide-react";
import { useCreditos } from "./CreditosProvider";
import { Aviso, Seccion, Vacio } from "./partes";
import { fmtNumber } from "@/lib/format";

const DIA = 86_400_000;
const fecha = (iso: string) => new Date(iso).toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" });

export function CaducidadPanel() {
  const { resumen } = useCreditos();
  // La hora se toma una vez al montar (un componente no puede leer el reloj en cada render).
  const [ahora] = useState(() => Date.now());
  if (!resumen) return null;
  const lotes = resumen.lotes.filter((l) => l.creditosRestantes > 0).sort((a, b) => a.caducaEn.localeCompare(b.caducaEn));
  const pronto = lotes.filter((l) => new Date(l.caducaEn).getTime() - ahora < 30 * DIA);
  const enRiesgo = pronto.reduce((n, l) => n + l.creditosRestantes, 0);
  return (
    <Seccion id="caducidad" titulo="Caducidad">
      <p className="text-small text-ink-2">Se gastan primero los créditos que caducan antes. Los packs caducan a los 12 meses (Prueba, a los 30 días).</p>
      {pronto.length > 0 && (
        <p role="alert" className="flex items-start gap-2 rounded-card border border-status-waiting/60 bg-status-waiting/15 p-3 text-small">
          <TriangleAlert size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-status-waiting" />
          <span><strong>{fmtNumber(enRiesgo)} créditos caducan en menos de 30 días.</strong> Úsalos antes del {fecha(pronto[0].caducaEn)}.</span>
        </p>
      )}
      {lotes.length === 0 ? <Vacio>No tienes créditos vivos: no hay nada que caduque.</Vacio> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] text-left text-small">
            <caption className="sr-only">Lotes de créditos y su fecha de caducidad</caption>
            <thead className="text-tiny text-ink-3">
              <tr><th scope="col" className="py-2 pr-3 font-normal">Lote</th><th scope="col" className="py-2 pr-3 text-right font-normal">Quedan</th><th scope="col" className="py-2 font-normal">Caduca</th></tr>
            </thead>
            <tbody>
              {lotes.map((l, i) => {
                const dias = Math.ceil((new Date(l.caducaEn).getTime() - ahora) / DIA);
                const urgente = dias < 30;
                return (
                  <tr key={l.id ?? i} className="border-t border-glass-border">
                    <td className="py-2 pr-3">{nombreOrigen(l.origen)}</td>
                    <td className="py-2 pr-3 text-right font-semibold">{fmtNumber(l.creditosRestantes)}{l.creditosIniciales ? <span className="font-normal text-ink-3"> de {fmtNumber(l.creditosIniciales)}</span> : null}</td>
                    <td className="py-2">{fecha(l.caducaEn)} <span className={urgente ? "font-semibold text-status-waiting" : "text-ink-3"}>({dias <= 0 ? "hoy" : `en ${dias} ${dias === 1 ? "día" : "días"}`}{urgente ? " · pronto" : ""})</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {pronto.length === 0 && lotes.length > 0 && <Aviso tono="ok">Ningún lote caduca en los próximos 30 días.</Aviso>}
    </Seccion>
  );
}

function nombreOrigen(o?: string) {
  return ({ pack: "Pack", prueba: "Pack Prueba", bono_mensual: "Bono mensual", regalo: "Regalo", ajuste: "Ajuste" } as Record<string, string>)[o ?? ""] ?? "Lote";
}
