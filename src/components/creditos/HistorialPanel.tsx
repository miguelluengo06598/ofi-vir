"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";
import { useCreditos } from "./CreditosProvider";
import { Aviso, Seccion, Vacio } from "./partes";
import { PillButton } from "@/components/glass";
import type { Movimiento } from "@/lib/creditos/tipos";
import { fmtDateTime, fmtNumber } from "@/lib/format";

const FILTROS = [
  { id: "", nombre: "Todo" },
  { id: "compra", nombre: "Compras" },
  { id: "consumo", nombre: "Consumos" },
  { id: "caducidad", nombre: "Caducidades" },
] as const;
const POR_PAGINA = 10;

const CONCEPTOS: Record<string, string> = {
  tarea_simple: "Tarea simple", tarea_estandar: "Tarea estándar", tarea_experta: "Tarea experta",
  traspaso: "Traspaso entre departamentos", correo: "Correo enviado", whatsapp: "WhatsApp",
  compra_pack: "Compra de pack", compra_prueba: "Pack Prueba", bono_mensual: "Bono mensual", caducidad: "Créditos caducados",
};
const nombreConcepto = (m: Movimiento) => CONCEPTOS[m.concepto] ?? m.concepto.replaceAll("_", " ");
const TIPO: Record<string, string> = { compra: "Compra", consumo: "Consumo", caducidad: "Caducidad", ajuste: "Ajuste", reembolso: "Reembolso" };

export function HistorialPanel() {
  const { resumen } = useCreditos();
  const saldo = resumen?.saldo.disponible;
  const [filtro, setFiltro] = useState<string>("");
  const [pagina, setPagina] = useState(1);
  const [datos, setDatos] = useState<{ total: number; totalPaginas: number; movimientos: Movimiento[] } | null>(null);
  const [error, setError] = useState(false);

  // Se vuelve a pedir al cambiar filtro/página o cuando cambia el saldo (hubo un movimiento).
  useEffect(() => {
    let cancelado = false;
    const q = new URLSearchParams({ pagina: String(pagina), porPagina: String(POR_PAGINA), ...(filtro ? { tipo: filtro } : {}) });
    fetch(`/api/creditos/movimientos?${q}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => { if (!cancelado) { setDatos(d); setError(false); } })
      .catch(() => !cancelado && setError(true));
    return () => { cancelado = true; };
  }, [filtro, pagina, saldo]);

  return (
    <Seccion id="historial" titulo="Historial">
      <div role="group" aria-label="Filtrar movimientos por tipo" className="flex flex-wrap gap-2">
        {FILTROS.map((f) => <PillButton key={f.id} compact active={filtro === f.id} onClick={() => { setFiltro(f.id); setPagina(1); }}>{f.nombre}</PillButton>)}
      </div>
      {error && <Aviso tono="error">No se pudo cargar el historial.</Aviso>}
      {!datos && !error && <p role="status" className="text-small text-ink-2">Cargando…</p>}
      {datos && (datos.movimientos.length === 0 ? <Vacio>No hay movimientos de este tipo.</Vacio> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-small">
            <caption className="sr-only">Movimientos del libro de créditos, del más reciente al más antiguo</caption>
            <thead className="text-tiny text-ink-3">
              <tr>
                <th scope="col" className="py-2 pr-3 font-normal">Fecha</th><th scope="col" className="py-2 pr-3 font-normal">Movimiento</th>
                <th scope="col" className="py-2 pr-3 text-right font-normal">Créditos</th><th scope="col" className="py-2 text-right font-normal">Saldo tras el movimiento</th>
              </tr>
            </thead>
            <tbody>
              {datos.movimientos.map((m) => (
                <tr key={m.id} className="border-t border-glass-border align-top">
                  <td className="py-2 pr-3 whitespace-nowrap text-ink-2">{fmtDateTime(m.creadoEn)}</td>
                  <td className="py-2 pr-3">
                    {nombreConcepto(m)}
                    <span className="block text-tiny text-ink-3">{TIPO[m.tipo] ?? m.tipo}{m.agente ? ` · ${m.agente}` : ""}</span>
                  </td>
                  <td className={`py-2 pr-3 text-right font-semibold whitespace-nowrap ${m.creditos > 0 ? "text-status-working" : ""}`}>{m.creditos > 0 ? "+" : "−"}{fmtNumber(Math.abs(m.creditos))}</td>
                  <td className="py-2 text-right whitespace-nowrap text-ink-2">{m.saldoResultante === null ? "—" : fmtNumber(m.saldoResultante)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
      {datos && datos.total > 0 && (
        <nav aria-label="Páginas del historial" className="flex items-center justify-between gap-2">
          <PillButton icon={ChevronLeft} aria-label="Página anterior" disabled={pagina <= 1} onClick={() => setPagina((p) => p - 1)} />
          <p role="status" className="text-small text-ink-2">Página {pagina} de {datos.totalPaginas} · {fmtNumber(datos.total)} movimientos</p>
          <PillButton icon={ChevronRight} aria-label="Página siguiente" disabled={pagina >= datos.totalPaginas} onClick={() => setPagina((p) => p + 1)} />
        </nav>
      )}
    </Seccion>
  );
}
