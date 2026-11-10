"use client";

import { Calculator, Info } from "lucide-react";
import Link from "next/link";
import { useId, useState, type ReactNode } from "react";
import { GlassPanel } from "@/components/glass";
import { NumeroAnimado } from "@/components/marketing/NumeroAnimado";
import { sobreEscena, tipo } from "@/components/marketing/tipografia";
import { SUPUESTOS_PERSONAL } from "@/content/precios";
import type { Pack } from "@/lib/creditos/packs";
import {
  CONSUMO_POR_CONVERSACION,
  CONSUMO_POR_CORREO,
  CONSUMO_POR_LEAD,
  CREDITOS_POR_CONVERSACION,
  CREDITOS_POR_CORREO,
  CREDITOS_POR_LEAD,
  creditosDelMes,
  euros,
  packRecomendado,
} from "@/lib/publico/estimacion";
import { fmtNumber } from "@/lib/format";

function Deslizador({ etiqueta, ayuda, valor, max, paso, onCambio }: { etiqueta: string; ayuda: string; valor: number; max: number; paso: number; onCambio: (n: number) => void }) {
  const id = useId();
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-small font-semibold">{etiqueta}</label>
        <span className="text-h2 tabular-nums">{fmtNumber(valor)}</span>
      </div>
      <input
        id={id}
        type="range"
        min={0}
        max={max}
        step={paso}
        value={valor}
        onChange={(e) => onCambio(Number(e.target.value))}
        aria-describedby={`${id}-a`}
        className="mt-3 h-2 w-full cursor-pointer appearance-none rounded-full bg-white/15 accent-white"
      />
      <p id={`${id}-a`} className="mt-1.5 text-tiny text-ink-2">{ayuda}</p>
    </div>
  );
}

function CampoNumero({ etiqueta, valor, onCambio, sufijo }: { etiqueta: string; valor: number; onCambio: (n: number) => void; sufijo: string }) {
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-3 text-small">
      <label htmlFor={id} className="text-ink-2">{etiqueta}</label>
      <span className="flex items-center gap-1.5">
        <input
          id={id}
          inputMode="numeric"
          value={valor}
          onChange={(e) => onCambio(Math.min(1_000_000, Number(e.target.value.replace(/\D/g, "")) || 0))}
          className="w-24 rounded-pill bg-white/10 px-3 py-1.5 text-right text-white ring-1 ring-white/20 focus:outline-2 focus:outline-white"
        />
        <span className="text-ink-2">{sufijo}</span>
      </span>
    </div>
  );
}

function Seccion({ id, antetitulo, titulo, intro, children }: { id: string; antetitulo: string; titulo: string; intro?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-t`} className="mx-auto w-full max-w-7xl scroll-mt-24 px-4 py-14 sm:py-20">
      <div className="mb-8 max-w-2xl">
        <p className={`${tipo.antetitulo} ${sobreEscena}`}>{antetitulo}</p>
        <h2 id={`${id}-t`} className={`mt-2 text-balance ${tipo.subtitular} ${sobreEscena}`}>{titulo}</h2>
        {intro && <div className={`mt-3 ${tipo.entradilla} ${sobreEscena}`}>{intro}</div>}
      </div>
      {children}
    </section>
  );
}

const desglose = (lista: readonly { concepto: string; creditos: number }[]) => lista.map((c) => `${c.concepto}: ${c.creditos}`).join(" · ");

/**
 * Calculadora (deslizadores → créditos, coste y pack recomendado) y, con las mismas cifras, la
 * comparación honesta con contratar. Todo es una estimación con los supuestos a la vista; los del
 * coste de personal son editables y están pendientes de confirmar (src/content/precios.ts).
 */
export function CalculadoraYComparacion({ packs, supuestosPendientes }: { packs: Pack[] | null; supuestosPendientes: boolean }) {
  const [leads, setLeads] = useState(150);
  const [conversaciones, setConversaciones] = useState(300);
  const [correos, setCorreos] = useState(200);
  const [sueldo, setSueldo] = useState<number>(SUPUESTOS_PERSONAL.sueldoBrutoAnual);
  const [cotizacion, setCotizacion] = useState<number>(SUPUESTOS_PERSONAL.cotizacionEmpresaPct);

  const creditos = creditosDelMes({ leads, conversaciones, correos });
  const recomendado = packs ? packRecomendado(packs, creditos) : null;
  const masGrande = packs?.filter((p) => !p.soloUnaVez).at(-1);

  // Comparación: coste mensual de una persona y de las dos que harían falta para el volumen de tres.
  const costePersonaMes = Math.round((sueldo * (1 + cotizacion / 100)) / 12);
  const personasExtra = SUPUESTOS_PERSONAL.rindeComo - 1;
  const costeContratar = costePersonaMes * personasExtra;
  const costeAgentesEur = Math.round(creditos / 100);

  return (
    <>
      <Seccion
        id="calculadora"
        antetitulo="Calculadora"
        titulo="¿Cuántos créditos necesitarías?"
        intro="Mueve los deslizadores con las cifras de un mes normal. Es una estimación: cada empresa y cada mes son distintos."
      >
        <GlassPanel className="grid gap-8 p-6 sm:p-8 lg:grid-cols-[1fr_1.1fr]">
          <div className="flex flex-col gap-7">
            <Deslizador etiqueta="Leads nuevos al mes" ayuda="Contactos que llegan por anuncios, formularios o tu web." valor={leads} max={2000} paso={10} onCambio={setLeads} />
            <Deslizador etiqueta="Conversaciones al mes" ayuda="Chats de WhatsApp o de la web que atiende un agente." valor={conversaciones} max={3000} paso={10} onCambio={setConversaciones} />
            <Deslizador etiqueta="Correos al mes" ayuda="Correos de clientes que hay que contestar." valor={correos} max={3000} paso={10} onCambio={setCorreos} />
          </div>

          <div className="flex flex-col gap-4">
            <div className="rounded-card bg-black/25 p-5">
              <p className="flex items-center gap-2 text-small text-ink-2"><Calculator size={16} aria-hidden="true" /> Estimación al mes</p>
              <p className="mt-2 leading-none" aria-live="polite" aria-atomic="true">
                <NumeroAnimado valor={creditos} className="text-[44px] font-semibold" /> <span className="text-h2 text-ink-2">créditos</span>
              </p>
              <p className="mt-2 text-body">
                ≈ <NumeroAnimado valor={creditos / 100} decimales={creditos % 100 === 0 ? 0 : 2} sufijo=" €" /> <span className="text-small text-ink-2">al mes, sin IVA</span>
              </p>
            </div>

            <div className="rounded-card bg-black/25 p-5 text-small">
              <p className="font-semibold">Pack recomendado</p>
              {!packs ? (
                <p className="mt-1 text-ink-2">Ahora no podemos mostrar los packs.</p>
              ) : creditos === 0 ? (
                <p className="mt-1 text-ink-2">Mueve los deslizadores para ver una recomendación.</p>
              ) : recomendado ? (
                <p className="mt-1 text-ink-2">
                  <span className="text-white">{recomendado.nombre}</span>: {fmtNumber(recomendado.creditos)} créditos por {euros(recomendado.precioCentimos)}
                  {recomendado.creditosBonoMensual && <>; con bono mensual, {fmtNumber(recomendado.creditosBonoMensual)} créditos al mes</>}.
                </p>
              ) : (
                <p className="mt-1 text-ink-2">Más que el pack {masGrande?.nombre}. <Link href="/solicitar-acceso" className="text-white underline underline-offset-4">Cuéntanos tu caso</Link>.</p>
              )}
            </div>

            <details className="rounded-card bg-black/25 p-5 text-small">
              <summary className="cursor-pointer font-semibold">Cómo lo calculamos</summary>
              <ul className="mt-3 flex flex-col gap-2 text-ink-2">
                <li>{fmtNumber(leads)} leads × {CREDITOS_POR_LEAD} = <span className="text-white">{fmtNumber(leads * CREDITOS_POR_LEAD)}</span><span className="block text-tiny text-ink-3">{desglose(CONSUMO_POR_LEAD)}</span></li>
                <li>{fmtNumber(conversaciones)} conversaciones × {CREDITOS_POR_CONVERSACION} = <span className="text-white">{fmtNumber(conversaciones * CREDITOS_POR_CONVERSACION)}</span><span className="block text-tiny text-ink-3">{desglose(CONSUMO_POR_CONVERSACION)} · los envíos por WhatsApp tendrán su tarifa, pendiente de definir</span></li>
                <li>{fmtNumber(correos)} correos × {CREDITOS_POR_CORREO} = <span className="text-white">{fmtNumber(correos * CREDITOS_POR_CORREO)}</span><span className="block text-tiny text-ink-3">{desglose(CONSUMO_POR_CORREO)}</span></li>
              </ul>
            </details>
          </div>
        </GlassPanel>
      </Seccion>

      <Seccion
        id="comparacion"
        antetitulo="Comparación honesta"
        titulo="Una persona con agentes rinde como tres"
        intro="No sustituye a tu equipo: lo multiplica. Alguien sigue revisando y aprobando lo importante. Esto es lo que costaría absorber el mismo volumen contratando."
      >
        <GlassPanel className="grid gap-6 p-6 sm:p-8 lg:grid-cols-[1fr_1fr]">
          <div className="flex flex-col gap-4">
            {supuestosPendientes && (
              <p role="note" className="rounded-card bg-status-waiting px-4 py-2.5 text-small font-semibold text-black">
                Aviso interno: supuestos pendientes de confirmar con el documento del proyecto (no se ve en producción).
              </p>
            )}
            <div className="rounded-card bg-black/25 p-5">
              <p className="mb-3 flex items-center gap-2 text-small font-semibold"><Info size={16} aria-hidden="true" /> Supuestos (cámbialos por los tuyos)</p>
              <div className="flex flex-col gap-3">
                <CampoNumero etiqueta="Sueldo bruto anual de una persona" valor={sueldo} onCambio={setSueldo} sufijo="€" />
                <CampoNumero etiqueta="Cotización a cargo de la empresa" valor={cotizacion} onCambio={(n) => setCotizacion(Math.min(60, n))} sufijo="%" />
              </div>
              <ul className="mt-4 flex flex-col gap-1.5 text-tiny text-ink-2">
                <li>· «Rinde como tres» es nuestro mensaje de producto, no una medición: supone que con agentes una persona absorbe el volumen de tres.</li>
                <li>· Tu equipo dedica unas {SUPUESTOS_PERSONAL.horasRevisionMes} h al mes a revisar y aprobar: ese tiempo no desaparece.</li>
                <li>· No incluye otros costes de contratar (selección, formación, bajas, puesto de trabajo).</li>
                <li>· El coste de los agentes sale de la calculadora de arriba.</li>
              </ul>
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <div className="rounded-card bg-black/25 p-5">
              <p className="text-small text-ink-2">Contratar {personasExtra} {personasExtra === 1 ? "persona" : "personas"} más para ese volumen</p>
              <p className="mt-1 text-[36px] leading-none font-semibold"><NumeroAnimado valor={costeContratar} sufijo=" €" /> <span className="text-small font-normal text-ink-2">al mes</span></p>
              <p className="mt-2 text-tiny text-ink-3">
                {personasExtra} × ({fmtNumber(sueldo)} € × {fmtNumber(1 + cotizacion / 100, 2)}) ÷ 12 = {personasExtra} × {fmtNumber(costePersonaMes)} €
              </p>
            </div>
            <div className="rounded-card bg-black/25 p-5 ring-1 ring-[#FFD48A]/50">
              <p className="text-small text-ink-2">Tu equipo de siempre + agentes</p>
              <p className="mt-1 text-[36px] leading-none font-semibold"><NumeroAnimado valor={costeAgentesEur} sufijo=" €" /> <span className="text-small font-normal text-ink-2">al mes en créditos</span></p>
              <p className="mt-2 text-tiny text-ink-3">{fmtNumber(creditos)} créditos de la calculadora ÷ 100, sin IVA · más el tiempo de revisión de tu equipo.</p>
            </div>
            <p className="text-small text-ink-2">Es una estimación orientativa con estos supuestos, no una promesa de ahorro.</p>
          </div>
        </GlassPanel>
      </Seccion>
    </>
  );
}
