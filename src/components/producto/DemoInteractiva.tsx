"use client";

import { AnimatePresence } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import { ApprovalsProvider, useApprovals } from "@/components/ApprovalsProvider";
import type { DepartmentId } from "@/components/glass";
import { HandoffLayer } from "@/components/handoffs/HandoffLayer";
import { DepartmentCard } from "@/components/office/DepartmentCard";
import { DepartmentPanel } from "@/components/office/DepartmentPanel";
import { SimulationProvider } from "@/components/SimulationProvider";
import { ALTO_DEMO_OFICINA } from "@/components/publico/ReservaDemoOficina";

/**
 * La oficina de verdad, con datos de ejemplo, para probarla: pulsa un departamento y se abre su panel
 * (el mismo de la oficina) con su equipo, sus aprobaciones y sus traspasos. Escape o «Cerrar» lo cierran
 * y el foco vuelve a la tarjeta. Todo queda en el navegador: aprobar o rechazar no envía nada.
 */
export default function DemoInteractiva() {
  return (
    <ApprovalsProvider>
      <SimulationProvider>
        <Oficina />
      </SimulationProvider>
    </ApprovalsProvider>
  );
}

function Oficina() {
  const { office, decisions, decide } = useApprovals();
  const [abierto, setAbierto] = useState<DepartmentId | null>(null);
  const quien = useRef<HTMLElement | null>(null);
  const fila = useRef<HTMLDivElement>(null);

  const abrir = (id: DepartmentId) => {
    quien.current = document.activeElement as HTMLElement | null;
    setAbierto(id);
  };
  const cerrar = useCallback(() => {
    setAbierto(null);
    requestAnimationFrame(() => quien.current?.focus());
  }, []);

  useEffect(() => {
    if (!abierto) return;
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && cerrar();
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [abierto, cerrar]);

  const resumen = office.summaries.find((s) => s.id === abierto);
  const { working, agents, pendingApprovals } = office.totals;

  return (
    <div className={`flex flex-col gap-4 ${ALTO_DEMO_OFICINA}`}>
      <p className="text-small text-ink-2">
        {working} de {agents} agentes trabajando · {pendingApprovals} {pendingApprovals === 1 ? "aprobación pendiente" : "aprobaciones pendientes"} · pulsa un departamento
      </p>
      <div ref={fila} className="relative lg:pt-14" inert={abierto !== null}>
        <HandoffLayer containerRef={fila} layoutKey="demo-interactiva" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {office.summaries.map((s, i) => (
            <DepartmentCard key={s.id} summary={s} filter="all" delay={0.05 + i * 0.05} onOpen={() => abrir(s.id)} />
          ))}
        </div>
      </div>
      <AnimatePresence>
        {resumen && <DepartmentPanel key={resumen.id} summary={resumen} decisions={decisions} onDecide={decide} onClose={cerrar} />}
      </AnimatePresence>
    </div>
  );
}
