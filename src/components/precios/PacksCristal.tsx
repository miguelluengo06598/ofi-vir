"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { useId, useState } from "react";
import { NumeroAnimado } from "@/components/marketing/NumeroAnimado";
import { usePreferencias } from "@/components/marketing/preferencias";
import type { Pack } from "@/lib/creditos/packs";
import { bonoPorcentaje, caducidad, euros, tareasQueCaben } from "@/lib/publico/estimacion";

const DESTACADO: Pack["id"] = "pro";

/**
 * Packs de credit_packs en tarjetas de cristal, con el Pro destacado y un interruptor de bono mensual
 * que anima el cambio de créditos y de «≈ tareas». Precios sin IVA. El Prueba no admite bono.
 */
export function PacksCristal({ packs }: { packs: Pack[] }) {
  const [bono, setBono] = useState(false);
  const { reducido } = usePreferencias();
  const etiqueta = useId();
  const recurrente = packs.find((p) => p.creditosBonoMensual);
  const pct = recurrente ? bonoPorcentaje(recurrente) : null;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center gap-4">
        <button
          type="button"
          role="switch"
          aria-checked={bono}
          aria-labelledby={etiqueta}
          onClick={() => setBono((b) => !b)}
          className={`relative h-8 w-14 shrink-0 rounded-pill ring-1 transition-colors duration-300 motion-reduce:transition-none ${bono ? "bg-status-working ring-status-working" : "bg-white/15 ring-white/25"}`}
        >
          <motion.span
            aria-hidden="true"
            className="absolute top-1 left-1 size-6 rounded-full bg-white shadow"
            animate={{ x: bono ? 24 : 0 }}
            transition={reducido ? { duration: 0 } : { type: "spring", stiffness: 500, damping: 32 }}
          />
        </button>
        <span id={etiqueta} className="text-body">
          <span className="font-semibold">Bono mensual{pct !== null ? ` (+${pct} %)` : ""}</span>
          <span className="block text-small text-ink-2">Tu pack cada mes como suscripción, con más créditos. Lo cancelas cuando quieras.</span>
        </span>
      </div>

      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {packs.map((p) => {
          const destacado = p.id === DESTACADO;
          const admite = p.creditosBonoMensual !== null;
          const creditos = bono && admite ? p.creditosBonoMensual! : p.creditos;
          return (
            <li
              key={p.id}
              className={`glass relative flex flex-col gap-4 rounded-card p-5 ${destacado ? "is-active ring-2 ring-[#FFD48A]/80 lg:-translate-y-3" : ""}`}
            >
              {destacado && (
                <span className="absolute -top-3 left-5 rounded-pill bg-[#FFD48A] px-3 py-1 text-tiny font-semibold text-black">Recomendado</span>
              )}
              <div>
                <h3 className="text-h2">{p.nombre}</h3>
                <p className="mt-1 text-small text-ink-2">
                  {p.soloUnaVez ? "Una sola vez por empresa" : bono && admite ? "Cada mes" : "Pago único"}
                </p>
              </div>
              <p>
                <span className="text-[30px] leading-none font-semibold tabular-nums">{euros(p.precioCentimos)}</span>
                <span className="text-small text-ink-2">{bono && admite ? " /mes" : ""} sin IVA</span>
              </p>
              <div className="rounded-card bg-black/25 p-3">
                <p className="text-h2">
                  <NumeroAnimado valor={creditos} /> <span className="text-small font-normal text-ink-2">créditos</span>
                </p>
                <p className="mt-1 text-tiny text-ink-2">
                  ≈ <NumeroAnimado valor={tareasQueCaben(creditos, "estandar")} /> tareas estándar
                  <br />≈ <NumeroAnimado valor={tareasQueCaben(creditos, "simple")} /> tareas simples
                </p>
                {bono && !admite && <p className="mt-2 text-tiny text-ink-3">Este pack no admite bono.</p>}
              </div>
              <p className="mt-auto text-tiny text-ink-3">Caducan a los {caducidad(p.diasCaducidad)}.</p>
              <Link
                href="/solicitar-acceso"
                className={`inline-flex justify-center rounded-pill px-4 py-2.5 text-small font-semibold ${destacado ? "bg-white text-black hover:bg-white/90" : "bg-white/10 ring-1 ring-white/25 hover:bg-white/15"}`}
              >
                Solicitar acceso
              </Link>
            </li>
          );
        })}
      </ul>
      <p className="mt-4 text-small text-ink-2">Precios sin IVA. Las tareas son orientativas: un mes real mezcla tipos distintos.</p>
    </div>
  );
}
