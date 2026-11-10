"use client";

import { AjustesPanel } from "./AjustesPanel";
import { CaducidadPanel } from "./CaducidadPanel";
import { ConsumoPanel } from "./ConsumoPanel";
import { useCreditos } from "./CreditosProvider";
import { HistorialPanel } from "./HistorialPanel";
import { PacksPanel } from "./PacksPanel";
import { RutinasPanel } from "./RutinasPanel";
import { SaldoPanel } from "./SaldoPanel";
import { Aviso } from "./partes";
import { PillButton } from "@/components/glass";
import { PausaOficina } from "@/components/oficina/PausaOficina";

/** Vista única «Créditos» (sustituye a la antigua vista Monedero). Todos los datos salen de /api/creditos. */
export function CreditosView() {
  const { estado, recargar } = useCreditos();
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-h1">Créditos</h1>
        <p className="text-body text-ink-2">Tu saldo, tu consumo y tus compras. 1 crédito = 1 céntimo.</p>
      </div>
      {estado === "cargando" && <p role="status" className="text-body text-ink-2">Cargando tus créditos…</p>}
      {estado === "error" && (
        <div className="flex flex-col items-start gap-3">
          <Aviso tono="error">No se pudieron cargar tus créditos. Comprueba que el servidor y la base de datos están en marcha.</Aviso>
          <PillButton onClick={() => void recargar()}>Reintentar</PillButton>
        </div>
      )}
      {estado === "listo" && (
        <>
          <PausaOficina />
          <SaldoPanel />
          <PacksPanel />
          <ConsumoPanel />
          <CaducidadPanel />
          <RutinasPanel />
          <AjustesPanel />
          <HistorialPanel />
        </>
      )}
    </div>
  );
}
