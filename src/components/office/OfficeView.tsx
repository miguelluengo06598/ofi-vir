"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Avatar, PillButton } from "@/components/glass";
import { buildOffice, type OfficeAgent, type StatusFilter } from "@/data/departments";
import { currentUser } from "@/data/navigation";
import type { DepartmentId } from "@/components/glass";
import { DepartmentCard } from "./DepartmentCard";
import { useApprovals } from "@/components/ApprovalsProvider";
import { DepartmentPanel } from "./DepartmentPanel";

const filters: { id: StatusFilter; label: string }[] = [
  { id: "all", label: "Todos" },
  { id: "working", label: "Trabajando" },
  { id: "waiting", label: "Esperan aprobación" },
];

// La hora solo se conoce en el cliente: en el servidor (-1) se muestra un saludo neutro.
function subscribeToClock(onChange: () => void) {
  const timer = setInterval(onChange, 60_000);
  return () => clearInterval(timer);
}
const getHour = () => new Date().getHours();
const getServerHour = () => -1;

function greeting(hour: number) {
  if (hour < 0) return "Hola";
  if (hour < 13) return "Buenos días";
  if (hour < 20) return "Buenas tardes";
  return "Buenas noches";
}

/** El agente recién contratado cruza la pantalla hasta su sitio en la tarjeta del departamento. */
function ArrivalFlight({ agent, onDone }: { agent: OfficeAgent; onDone: () => void }) {
  const [target, setTarget] = useState<{ x: number; y: number; scale: number } | null>(null);

  useEffect(() => {
    // Espera a que las tarjetas terminen de entrar antes de medir dónde aterrizar.
    const timer = setTimeout(() => {
      const el = document.querySelector(`[data-agent-id="${agent.id}"]`);
      if (!el) return onDone();
      const r = el.getBoundingClientRect();
      setTarget({ x: r.left + r.width / 2 - 32, y: r.top + r.height / 2 - 32, scale: r.width / 64 });
    }, 900);
    return () => clearTimeout(timer);
  }, [agent.id, onDone]);

  return (
    <motion.div
      aria-hidden="true"
      className="pointer-events-none fixed top-0 left-0 z-50 rounded-full shadow-[0_0_48px_rgba(79,140,255,0.8)]"
      initial={{ x: window.innerWidth / 2 - 32, y: window.innerHeight / 2 - 32, scale: 2.4, opacity: 0 }}
      animate={target ? { ...target, opacity: 1 } : { opacity: 1 }}
      transition={{ type: "spring", stiffness: 70, damping: 16, opacity: { duration: 0.3 } }}
      onAnimationComplete={(definition) => {
        // Solo termina con el vuelo (que define `x`), no con la aparición inicial.
        if (typeof definition === "object" && "x" in definition) onDone();
      }}
    >
      <Avatar name={agent.name} tone={agent.departmentId} size={64} />
    </motion.div>
  );
}

export function OfficeView() {
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [selected, setSelected] = useState<DepartmentId | null>(null);
  const { decisions, resolved, hired, arrival, finishArrival, decide } = useApprovals();
  const opener = useRef<HTMLElement | null>(null);
  const hour = useSyncExternalStore(subscribeToClock, getHour, getServerHour);

  const { summaries, totals } = useMemo(() => buildOffice(resolved, hired), [resolved, hired]);

  function open(id: DepartmentId) {
    opener.current = document.activeElement as HTMLElement | null;
    setSelected(id);
  }

  function close() {
    setSelected(null);
    // Devuelve el foco a la tarjeta una vez desbloqueada.
    requestAnimationFrame(() => opener.current?.focus());
  }

  useEffect(() => {
    if (!selected) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected]);

  const arrivingAgent = arrival ? summaries.flatMap((d) => d.agents).find((a) => a.id === arrival) : undefined;
  const selectedSummary = summaries.find((d) => d.id === selected);
  const visible = summaries.filter(
    (d) => filter === "all" || d.agents.some((a) => a.status === filter),
  );
  const { working, agents, pendingApprovals } = totals;

  return (
    <div className="flex flex-1 flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-h1" suppressHydrationWarning>
            {greeting(hour)}, {currentUser.name.split(" ")[0]}
          </h1>
          <p className="text-body text-ink-2">
            {working} de {agents} agentes trabajando · {pendingApprovals}{" "}
            {pendingApprovals === 1 ? "aprobación pendiente" : "aprobaciones pendientes"}
          </p>
        </div>
        <div role="group" aria-label="Filtrar por estado" className="flex flex-wrap gap-2">
          {filters.map((f) => (
            <PillButton key={f.id} active={filter === f.id} onClick={() => setFilter(f.id)}>
              {f.label}
            </PillButton>
          ))}
        </div>
      </div>

      {/* Fila de tarjetas a media altura, suspendidas frente a los ventanales. */}
      <div className="flex flex-1 items-center" inert={selected !== null}>
        <div className="grid w-full gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          <AnimatePresence>
            {visible.map((summary, i) => (
              <DepartmentCard key={summary.id} summary={summary} filter={filter} delay={0.1 + i * 0.08} onOpen={() => open(summary.id)} />
            ))}
          </AnimatePresence>
        </div>
      </div>

      {arrivingAgent && <ArrivalFlight agent={arrivingAgent} onDone={finishArrival} />}

      <AnimatePresence>
        {selectedSummary && (
          <DepartmentPanel
            key={selectedSummary.id}
            summary={selectedSummary}
            decisions={decisions}
            onDecide={decide}
            onClose={close}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
