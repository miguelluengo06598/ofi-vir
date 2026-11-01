"use client";

import { AnimatePresence } from "framer-motion";
import { useState, useSyncExternalStore } from "react";
import { PillButton } from "@/components/glass";
import { departmentSummaries, officeTotals, type StatusFilter } from "@/data/departments";
import { currentUser } from "@/data/navigation";
import { DepartmentCard } from "./DepartmentCard";

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

export function OfficeView() {
  const [filter, setFilter] = useState<StatusFilter>("all");
  const hour = useSyncExternalStore(subscribeToClock, getHour, getServerHour);

  const visible = departmentSummaries.filter(
    (d) => filter === "all" || d.agents.some((a) => a.status === filter),
  );
  const { working, agents, pendingApprovals } = officeTotals;

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
      <div className="flex flex-1 items-center">
        <div className="grid w-full gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          <AnimatePresence>
            {visible.map((summary, i) => (
              <DepartmentCard key={summary.id} summary={summary} filter={filter} delay={0.1 + i * 0.08} />
            ))}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
