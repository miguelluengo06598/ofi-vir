"use client";

import { useInView } from "framer-motion";
import { Pause, Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ApprovalsProvider, useApprovals } from "@/components/ApprovalsProvider";
import { PillButton, departmentMeta } from "@/components/glass";
import { HandoffLayer } from "@/components/handoffs/HandoffLayer";
import { DepartmentCard } from "@/components/office/DepartmentCard";
import { SimulationProvider, useSimulation } from "@/components/SimulationProvider";
import { agentById, firstName } from "@/data/agents";
import { ALTO_DEMO_OFICINA } from "./ReservaDemoOficina";

const nada = () => {};

/**
 * La oficina de verdad (tarjetas de departamento, capa de traspasos y simulación) con datos de ejemplo.
 * Se carga de forma diferida desde DemoOficinaDiferida: no entra en el JavaScript inicial de la web.
 */
export default function DemoOficina() {
  return (
    <ApprovalsProvider>
      <SimulationProvider>
        <Escena />
      </SimulationProvider>
    </ApprovalsProvider>
  );
}

function Escena() {
  const { office } = useApprovals();
  const { latest, paused, toggle } = useSimulation();
  const zona = useRef<HTMLDivElement>(null);
  const fila = useRef<HTMLDivElement>(null);
  const visible = useInView(zona, { margin: "100px" });
  const [pausaManual, setPausaManual] = useState(false);

  // Fuera de pantalla no se gasta nada: la simulación se detiene y vuelve al verla.
  const debePausar = pausaManual || !visible;
  useEffect(() => {
    if (debePausar !== paused) toggle();
  }, [debePausar, paused, toggle]);

  const h = latest?.handoff;
  const { working, agents } = office.totals;

  return (
    <div ref={zona} className={`flex flex-col gap-4 ${ALTO_DEMO_OFICINA}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="inline-flex items-center gap-2 text-small text-ink-2 [text-shadow:0_1px_8px_rgba(0,0,0,0.6)]">
          <span aria-hidden="true" className="size-2 rounded-full bg-status-working" />
          Oficina de demostración · {working} de {agents} agentes trabajando · datos de ejemplo
        </p>
        <PillButton icon={pausaManual ? Play : Pause} onClick={() => setPausaManual((p) => !p)} compact>
          {pausaManual ? "Reanudar demo" : "Pausar demo"}
        </PillButton>
      </div>

      {/* Ilustración: las tarjetas no se pueden abrir aquí, así que la fila es inerte. */}
      <div ref={fila} inert className="relative lg:pt-14">
        <HandoffLayer containerRef={fila} layoutKey="demo" />
        <div className="grid w-full gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {office.summaries.map((s, i) => (
            <div key={s.id} className={i > 2 ? "hidden sm:block" : undefined}>
              <DepartmentCard summary={s} filter="all" delay={0.05 + i * 0.06} onOpen={nada} />
            </div>
          ))}
        </div>
      </div>

      {/* En móvil no hay líneas: el último traspaso se cuenta en texto. */}
      <p className="min-h-6 text-small text-ink-2 lg:hidden [text-shadow:0_1px_8px_rgba(0,0,0,0.6)]">
        {h ? (
          <>
            <span className="font-semibold text-white">{firstName(agentById(h.fromAgentId).name)}</span> ({departmentMeta[h.fromDepartmentId].label}) →{" "}
            <span className="font-semibold text-white">{firstName(agentById(h.toAgentId).name)}</span> ({departmentMeta[h.toDepartmentId].label}): {h.summary}
          </>
        ) : (
          "Esperando el primer traspaso…"
        )}
      </p>
    </div>
  );
}
