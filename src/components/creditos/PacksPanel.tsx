"use client";

import { Sparkles } from "lucide-react";
import { useId, useState } from "react";
import { useCreditos } from "./CreditosProvider";
import { Aviso, Seccion } from "./partes";
import { GlassPanel, PillButton } from "@/components/glass";
import { creditosAEur, tareasEstandar, type PackVista } from "@/lib/creditos/tipos";
import { fmtEur, fmtNumber } from "@/lib/format";
import { MotionGlassPanel } from "@/components/glass";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef } from "react";
import { useFocusTrap } from "@/lib/useFocusTrap";

const RECOMENDADO = "pro";
const euros = (centimos: number) => fmtEur(creditosAEur(centimos));

function Confirmacion({ pack, bono, onSi, onNo, ocupado }: { pack: PackVista; bono: boolean; onSi: () => void; onNo: () => void; ocupado: boolean }) {
  const dialog = useRef<HTMLElement>(null);
  const id = useId();
  useFocusTrap(dialog);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); onNo(); } };
    document.addEventListener("keydown", k, true);
    return () => document.removeEventListener("keydown", k, true);
  }, [onNo]);
  const creditos = bono ? pack.creditosBonoMensual ?? pack.creditos : pack.creditos;
  return (
    <>
      <motion.div aria-hidden="true" className="fixed inset-0 z-[80] bg-black/50" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onNo} />
      <div className="pointer-events-none fixed inset-0 z-[90] flex items-center justify-center p-4">
        <MotionGlassPanel
          ref={dialog} role="alertdialog" aria-modal="true" aria-labelledby={`${id}-t`} aria-describedby={`${id}-d`}
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }} transition={{ duration: 0.25, ease: "easeOut" }}
          className="pointer-events-auto flex w-full max-w-md flex-col gap-4 p-6"
        >
          <h2 id={`${id}-t`} className="text-h2">{bono ? `Contratar bono mensual · ${pack.nombre}` : `Comprar pack ${pack.nombre}`}</h2>
          <div id={`${id}-d`} className="flex flex-col gap-1 text-small">
            <p className="text-body">Recibirás <strong>{fmtNumber(creditos)} créditos</strong>{bono ? " ahora y cada mes" : ""}.</p>
            <p>Importe: {euros(pack.importeCentimos)} + IVA {euros(pack.ivaCentimos)} = <strong>{euros(pack.totalCentimos)}</strong></p>
            <p className="text-ink-2">Pago simulado en local: no se cobra nada real.</p>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <PillButton onClick={onNo} disabled={ocupado}>Cancelar</PillButton>
            <PillButton active aria-pressed={undefined} onClick={onSi} disabled={ocupado}>{ocupado ? "Procesando…" : "Confirmar compra"}</PillButton>
          </div>
        </MotionGlassPanel>
      </div>
    </>
  );
}

export function PacksPanel() {
  const { resumen, comprar } = useCreditos();
  const [bono, setBono] = useState<Record<string, boolean>>({});
  const [pendiente, setPendiente] = useState<{ pack: PackVista; bono: boolean } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [msg, setMsg] = useState<{ tono: "ok" | "error"; texto: string } | null>(null);
  if (!resumen) return null;
  const bonoActivo = resumen.ajustes.bonoMensualPackId;

  async function confirmar() {
    if (!pendiente) return;
    setOcupado(true);
    const r = await comprar(pendiente.pack.id, pendiente.bono ? "bono_mensual" : "unico");
    setOcupado(false);
    setMsg(r.ok
      ? { tono: "ok", texto: `Compra realizada: +${fmtNumber((r.datos.lote as { creditos: number }).creditos)} créditos.` }
      : { tono: "error", texto: r.mensaje });
    setPendiente(null);
  }

  return (
    <Seccion id="packs" titulo="Packs de créditos">
      <p className="text-small text-ink-2">Los agentes y departamentos son gratis: solo pagas los créditos que usas. Precios sin IVA.</p>
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
        {resumen.packs.filter((p) => p.disponible).map((p) => {
          const admiteBono = p.creditosBonoMensual !== null;
          const conBono = !!bono[p.id] && admiteBono;
          const creditos = conBono ? p.creditosBonoMensual! : p.creditos;
          const recomendado = p.id === RECOMENDADO;
          return (
            <li key={p.id}>
              <GlassPanel className={`flex h-full flex-col gap-3 rounded-card p-4 ${recomendado ? "border-accent/70 bg-accent/15!" : ""}`}>
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-body font-semibold">{p.nombre}</h3>
                  {recomendado && <span className="flex items-center gap-1 rounded-pill bg-accent px-2 py-0.5 text-tiny font-semibold text-white"><Sparkles size={12} aria-hidden="true" />Recomendado</span>}
                </div>
                <p className="text-h1">{euros(p.importeCentimos)}</p>
                <p className="-mt-2 text-tiny text-ink-3">sin IVA</p>
                <p className="text-small"><strong>{fmtNumber(creditos)}</strong> créditos</p>
                <p className="text-small text-ink-2">≈ {fmtNumber(tareasEstandar(creditos))} tareas estándar</p>
                <p className="text-tiny text-ink-3">Caducan a los {p.diasCaducidad === 30 ? "30 días" : "12 meses"}</p>
                {admiteBono && (
                  <label className="flex cursor-pointer items-start gap-2 text-small has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60">
                    <input
                      type="checkbox" role="switch" className="mt-0.5 size-4 shrink-0 accent-[#4F8CFF]"
                      checked={conBono} disabled={!!bonoActivo}
                      onChange={(e) => setBono((b) => ({ ...b, [p.id]: e.target.checked }))}
                    />
                    <span>Bono mensual (+10 %){bonoActivo && <span className="block text-tiny text-ink-3">Ya tienes un bono activo</span>}</span>
                  </label>
                )}
                <div className="mt-auto">
                  <PillButton active={recomendado} aria-pressed={undefined} className="w-full justify-center" onClick={() => { setMsg(null); setPendiente({ pack: p, bono: conBono }); }}>
                    {conBono ? "Contratar bono" : "Comprar"}
                    <span className="sr-only"> {p.nombre}</span>
                  </PillButton>
                </div>
              </GlassPanel>
            </li>
          );
        })}
      </ul>
      {msg && <Aviso tono={msg.tono}>{msg.texto}</Aviso>}
      <AnimatePresence>{pendiente && <Confirmacion key="c" pack={pendiente.pack} bono={pendiente.bono} ocupado={ocupado} onSi={confirmar} onNo={() => !ocupado && setPendiente(null)} />}</AnimatePresence>
    </Seccion>
  );
}
