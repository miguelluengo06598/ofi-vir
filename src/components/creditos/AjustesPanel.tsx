"use client";

import { useId, useState } from "react";
import { useCreditos } from "./CreditosProvider";
import { Aviso, Barra, Seccion } from "./partes";
import { GlassInput, PillButton } from "@/components/glass";
import { creditosAEur } from "@/lib/creditos/tipos";
import { fmtEur, fmtNumber } from "@/lib/format";

type Msg = { tono: "ok" | "error"; texto: string } | null;
const entero = (s: string) => (/^\d+$/.test(s.trim()) ? Number(s.trim()) : NaN);
const FECHA = (iso: string) => new Date(iso).toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" });

export function AjustesPanel() {
  const { resumen, guardarAjustes, cancelarBono } = useCreditos();
  const id = useId();
  const a = resumen?.ajustes;
  const [tope, setTope] = useState("");
  const [umbral, setUmbral] = useState("");
  const [packAuto, setPackAuto] = useState<string | null>(null);
  const [auto, setAuto] = useState(false);
  const [msgTope, setMsgTope] = useState<Msg>(null);
  const [msgAuto, setMsgAuto] = useState<Msg>(null);
  const [msgBono, setMsgBono] = useState<Msg>(null);
  const [confirmaBono, setConfirmaBono] = useState(false);

  // Se parte de lo guardado en el servidor cada vez que cambia (ajuste de estado durante el render, sin efecto).
  const guardado = a ? JSON.stringify([a.topeMensualCreditos, a.recargaAuto.activa, a.recargaAuto.umbral, a.recargaAuto.packId]) : null;
  const [visto, setVisto] = useState<string | null>(null);
  if (a && guardado !== visto) {
    setVisto(guardado);
    setTope(a.topeMensualCreditos === null ? "" : String(a.topeMensualCreditos));
    setAuto(a.recargaAuto.activa);
    setUmbral(a.recargaAuto.umbral === null ? "" : String(a.recargaAuto.umbral));
    setPackAuto(a.recargaAuto.packId);
  }
  if (!resumen || !a) return null;

  const consumido = resumen.saldo.consumidosEsteMes;
  const tl = a.topeMensualCreditos;
  const pct = tl ? Math.round((consumido / tl) * 100) : 0;
  const topeValido = tope.trim() === "" || Number.isFinite(entero(tope));
  const packsRecarga = resumen.packs.filter((p) => p.id !== "prueba");
  const nombrePack = (pid: string | null) => resumen.packs.find((p) => p.id === pid)?.nombre ?? pid;
  const autoValida = !auto || (Number.isFinite(entero(umbral)) && entero(umbral) > 0 && packAuto !== null);

  async function salvarTope(e: React.FormEvent) {
    e.preventDefault();
    if (!topeValido) return;
    const r = await guardarAjustes({ topeMensualCreditos: tope.trim() === "" ? null : entero(tope) });
    setMsgTope(r.ok ? { tono: "ok", texto: tope.trim() === "" ? "Tope quitado." : "Tope guardado." } : { tono: "error", texto: r.mensaje });
  }
  async function salvarAuto(e: React.FormEvent) {
    e.preventDefault();
    if (!autoValida) return;
    const r = await guardarAjustes({ recargaAuto: { activa: auto, ...(auto ? { umbral: entero(umbral), packId: packAuto } : {}) } });
    setMsgAuto(r.ok ? { tono: "ok", texto: auto ? "Recarga automática guardada." : "Recarga automática desactivada." } : { tono: "error", texto: r.mensaje });
  }
  async function quitarBono() {
    const r = await cancelarBono();
    setConfirmaBono(false);
    setMsgBono(r.ok ? { tono: "ok", texto: "Bono cancelado. Conservas los créditos ya recibidos." } : { tono: "error", texto: r.mensaje });
  }

  return (
    <Seccion id="ajustes" titulo="Ajustes">
      <div className="grid gap-6 lg:grid-cols-3">
        <form onSubmit={salvarTope} className="flex flex-col gap-3" aria-labelledby={`${id}-tope`}>
          <h3 id={`${id}-tope`} className="text-body font-semibold">Tope de gasto mensual</h3>
          <p className="text-small text-ink-2">Al alcanzarlo, los agentes dejan de ejecutar tareas hasta el mes siguiente. Vacío = sin tope.</p>
          <GlassInput inputMode="numeric" aria-label="Tope mensual en créditos" aria-invalid={!topeValido} placeholder="Sin tope" value={tope} onChange={(e) => setTope(e.target.value)} />
          {tope.trim() !== "" && topeValido && <p className="text-tiny text-ink-3">≈ {fmtEur(creditosAEur(entero(tope)))} al mes</p>}
          {tl !== null && (
            <div className="flex flex-col gap-1">
              <Barra valor={consumido} max={tl} etiqueta={`Consumido: ${pct} % del tope`} color={pct >= 100 ? "bg-status-error" : pct >= 80 ? "bg-status-waiting" : "bg-status-working"} />
              <p className="text-small">{fmtNumber(consumido)} de {fmtNumber(tl)} créditos · {pct} %</p>
            </div>
          )}
          <div><PillButton type="submit" active aria-pressed={undefined} disabled={!topeValido}>Guardar tope</PillButton></div>
          {msgTope && <Aviso tono={msgTope.tono}>{msgTope.texto}</Aviso>}
        </form>

        <form onSubmit={salvarAuto} className="flex flex-col gap-3" aria-labelledby={`${id}-auto`}>
          <h3 id={`${id}-auto`} className="text-body font-semibold">Recarga automática</h3>
          <label className="flex cursor-pointer items-center gap-2 text-small">
            <input type="checkbox" role="switch" className="size-4 accent-[#4F8CFF]" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
            Recargar cuando quede poco saldo
          </label>
          {auto && (
            <>
              <GlassInput inputMode="numeric" aria-label="Umbral en créditos" placeholder="Umbral (créditos)" value={umbral} onChange={(e) => setUmbral(e.target.value)} />
              <div role="group" aria-label="Pack a recargar" className="flex flex-wrap gap-2">
                {packsRecarga.map((p) => <PillButton key={p.id} compact active={packAuto === p.id} onClick={() => setPackAuto(p.id)}>{p.nombre}</PillButton>)}
              </div>
            </>
          )}
          <p className="text-tiny text-ink-3">En local la recarga se simula; con Stripe cobrará de verdad.</p>
          <div><PillButton type="submit" active aria-pressed={undefined} disabled={!autoValida}>Guardar recarga</PillButton></div>
          {msgAuto && <Aviso tono={msgAuto.tono}>{msgAuto.texto}</Aviso>}
        </form>

        <div className="flex flex-col gap-3">
          <h3 className="text-body font-semibold">Bono mensual</h3>
          {a.bonoMensualPackId ? (
            <>
              <p className="text-small">Activo con el pack <strong>{nombrePack(a.bonoMensualPackId)}</strong> (+10 % de créditos).</p>
              {a.bonoProximaRenovacionEn && <p className="text-small text-ink-2">Próxima renovación: {FECHA(a.bonoProximaRenovacionEn)}.</p>}
              {confirmaBono ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-small">¿Cancelar el bono? Conservas lo recibido.</span>
                  <PillButton onClick={() => setConfirmaBono(false)}>No</PillButton>
                  <PillButton active aria-pressed={undefined} onClick={quitarBono}>Sí, cancelar</PillButton>
                </div>
              ) : <div><PillButton onClick={() => setConfirmaBono(true)}>Cancelar bono</PillButton></div>}
            </>
          ) : <p className="text-small text-ink-2">No tienes bono activo. Puedes contratarlo desde un pack con «Bono mensual (+10 %)».</p>}
          {msgBono && <Aviso tono={msgBono.tono}>{msgBono.texto}</Aviso>}
        </div>
      </div>
    </Seccion>
  );
}
