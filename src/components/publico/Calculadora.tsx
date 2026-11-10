"use client";

import { Calculator, Clock, MessageSquare, UserPlus } from "lucide-react";
import { useId, useState } from "react";
import { GlassInput, GlassPanel } from "@/components/glass";
import type { Pack } from "@/lib/creditos/packs";
import { fmtNumber } from "@/lib/format";
import {
  CONSUMO_POR_LEAD,
  CONSUMO_POR_MENSAJE,
  CREDITOS_POR_LEAD,
  CREDITOS_POR_MENSAJE,
  creditosEstimados,
  euros,
  leerCantidad,
  packRecomendado,
} from "@/lib/publico/estimacion";
import { EnlacePildora } from "./Botones";

/** Supuestos del ahorro de tiempo. Son del visitante: se ven y se pueden cambiar. */
const MINUTOS_POR_LEAD = "10";
const MINUTOS_POR_MENSAJE = "4";

function Campo({ etiqueta, ayuda, valor, onCambio, icono }: { etiqueta: string; ayuda?: string; valor: string; onCambio: (v: string) => void; icono: typeof UserPlus }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <span id={`${id}-e`} className="text-small font-semibold">{etiqueta}</span>
      <GlassInput
        icon={icono}
        aria-labelledby={`${id}-e`}
        aria-describedby={ayuda ? `${id}-a` : undefined}
        inputMode="numeric"
        autoComplete="off"
        value={valor}
        onChange={(e) => onCambio(e.target.value.replace(/[^\d]/g, "").slice(0, 7))}
        className="text-body!"
      />
      {ayuda && <span id={`${id}-a`} className="text-tiny text-ink-2">{ayuda}</span>}
    </div>
  );
}

export function Calculadora({ packs }: { packs: Pack[] | null }) {
  const [leadsTxt, setLeads] = useState("150");
  const [mensajesTxt, setMensajes] = useState("400");
  const [minLeadTxt, setMinLead] = useState(MINUTOS_POR_LEAD);
  const [minMensajeTxt, setMinMensaje] = useState(MINUTOS_POR_MENSAJE);

  const leads = leerCantidad(leadsTxt);
  const mensajes = leerCantidad(mensajesTxt);
  const total = creditosEstimados(leads, mensajes);
  const recomendado = packs ? packRecomendado(packs, total) : null;
  const prueba = packs?.find((p) => p.soloUnaVez);
  const masGrande = packs?.filter((p) => !p.soloUnaVez).at(-1);

  const minutos = leads * leerCantidad(minLeadTxt, 600) + mensajes * leerCantidad(minMensajeTxt, 600);
  const horas = Math.round(minutos / 60);

  return (
    <GlassPanel className="grid gap-8 p-5 sm:p-8 lg:grid-cols-[1fr_1.2fr]">
      <form className="flex flex-col gap-5" onSubmit={(e) => e.preventDefault()} aria-label="Datos de tu empresa">
        <Campo etiqueta="Leads nuevos al mes" ayuda="Contactos que llegan por anuncios, formularios o tu web." valor={leadsTxt} onCambio={setLeads} icono={UserPlus} />
        <Campo etiqueta="Mensajes de clientes al mes" ayuda="Consultas por WhatsApp o correo que hay que contestar." valor={mensajesTxt} onCambio={setMensajes} icono={MessageSquare} />
        <details className="rounded-card bg-black/15 p-4">
          <summary className="cursor-pointer text-small font-semibold">Supuestos del tiempo que ahorras</summary>
          <div className="mt-4 flex flex-col gap-4">
            <Campo etiqueta="Minutos que dedicas hoy a cada lead" valor={minLeadTxt} onCambio={setMinLead} icono={Clock} />
            <Campo etiqueta="Minutos que dedicas hoy a cada mensaje" valor={minMensajeTxt} onCambio={setMinMensaje} icono={Clock} />
          </div>
        </details>
      </form>

      <div className="flex flex-col gap-5">
        <div aria-live="polite" aria-atomic="true">
          <p className="flex items-center gap-2 text-small text-ink-2">
            <Calculator size={16} aria-hidden="true" /> Estimación al mes
          </p>
          <p className="mt-1 text-[32px] leading-tight font-semibold">
            {fmtNumber(total)} créditos <span className="text-h2 text-ink-2">≈ {euros(total)}</span>
          </p>
          <p className="mt-1 text-small text-ink-2">Sin IVA. Es una estimación: cada empresa y cada mes son distintos.</p>
        </div>

        <div className="rounded-card bg-black/20 p-4 text-small">
          <p className="font-semibold">Cómo lo calculamos</p>
          <ul className="mt-2 flex flex-col gap-1 text-ink-2">
            <li>
              {fmtNumber(leads)} leads × {CREDITOS_POR_LEAD} créditos = <span className="text-white">{fmtNumber(leads * CREDITOS_POR_LEAD)}</span>
              <span className="block text-tiny text-ink-3">{CONSUMO_POR_LEAD.map((c) => `${c.concepto}: ${c.creditos}`).join(" · ")}</span>
            </li>
            <li>
              {fmtNumber(mensajes)} mensajes × {CREDITOS_POR_MENSAJE} créditos = <span className="text-white">{fmtNumber(mensajes * CREDITOS_POR_MENSAJE)}</span>
              <span className="block text-tiny text-ink-3">{CONSUMO_POR_MENSAJE.map((c) => `${c.concepto}: ${c.creditos}`).join(" · ")}</span>
            </li>
          </ul>
          <p className="mt-2 text-tiny text-ink-3">Calculado con respuestas por correo. WhatsApp tendrá su propia tarifa, pendiente de definir.</p>
        </div>

        {packs ? (
          <div className="rounded-card bg-black/20 p-4 text-small">
            <p className="font-semibold">Pack recomendado</p>
            {total === 0 ? (
              <p className="mt-1 text-ink-2">Escribe tus cifras para ver una recomendación.</p>
            ) : recomendado ? (
              <p className="mt-1 text-ink-2">
                <span className="text-white">{recomendado.nombre}</span>: {fmtNumber(recomendado.creditos)} créditos por {euros(recomendado.precioCentimos)}.
                {recomendado.creditosBonoMensual && <> Con el bono mensual recibes {fmtNumber(recomendado.creditosBonoMensual)} créditos cada mes.</>}
              </p>
            ) : (
              <p className="mt-1 text-ink-2">
                Necesitas más que el pack {masGrande?.nombre ?? "más grande"}. Cuéntanos tu caso y te preparamos una propuesta.
              </p>
            )}
            {prueba && total > 0 && (
              <p className="mt-2 text-tiny text-ink-3">
                Para empezar: pack {prueba.nombre}, {fmtNumber(prueba.creditos)} créditos por {euros(prueba.precioCentimos)}, una sola vez.
              </p>
            )}
          </div>
        ) : (
          <p className="text-small text-ink-2">Ahora no podemos mostrar los packs. Vuelve a intentarlo en unos minutos.</p>
        )}

        <div className="rounded-card bg-black/20 p-4 text-small">
          <p className="font-semibold">Tiempo que hoy dedica tu equipo a esto</p>
          <p className="mt-1 text-ink-2">
            ({fmtNumber(leads)} × {leerCantidad(minLeadTxt, 600)} min) + ({fmtNumber(mensajes)} × {leerCantidad(minMensajeTxt, 600)} min) ≈{" "}
            <span className="text-white">{fmtNumber(horas)} horas al mes</span>
          </p>
          <p className="mt-1 text-tiny text-ink-3">
            Estimación con tus supuestos. No todo ese tiempo se libera: alguien tiene que revisar y aprobar lo importante.
          </p>
        </div>

        <EnlacePildora href="/solicitar-acceso" className="self-start">Solicitar acceso</EnlacePildora>
      </div>
    </GlassPanel>
  );
}
