"use client";

import { AnimatePresence } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { PillButton, departmentMeta, type DepartmentId } from "@/components/glass";
import { useApprovals } from "@/components/ApprovalsProvider";
import { departmentOrder } from "@/data/departments";
import { AgentCard } from "./AgentCard";
import { AgentDialog } from "./AgentDialog";

type StatusFilter = "all" | "working" | "waiting" | "expert";

const statusFilters: { id: StatusFilter; label: string }[] = [
  { id: "all", label: "Todos" },
  { id: "working", label: "Trabajando" },
  { id: "waiting", label: "Esperan aprobación" },
  { id: "expert", label: "Con el experto" },
];

export function AgentsView() {
  const { office } = useApprovals();
  const [dept, setDept] = useState<DepartmentId | "all">("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [selected, setSelected] = useState<string | null>(null);
  const opener = useRef<HTMLElement | null>(null);

  const agents = office.summaries.flatMap((s) => s.agents);
  const visible = agents.filter(
    (a) => (dept === "all" || a.departmentId === dept) && (status === "all" || a.status === status),
  );
  const working = agents.filter((a) => a.status === "working").length;
  const selectedAgent = agents.find((a) => a.id === selected);

  function open(id: string) {
    opener.current = document.activeElement as HTMLElement | null;
    setSelected(id);
  }
  function close() {
    setSelected(null);
    requestAnimationFrame(() => opener.current?.focus());
  }

  useEffect(() => {
    if (!selected) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-h1">Agentes</h1>
        <p className="text-body text-ink-2">
          {agents.length} agentes contratados · {working} trabajando
        </p>
      </div>

      <div className="flex flex-col gap-3" inert={selected !== null}>
        <div role="group" aria-label="Filtrar por departamento" className="flex flex-wrap gap-2">
          <PillButton active={dept === "all"} onClick={() => setDept("all")}>
            Todos
          </PillButton>
          {departmentOrder.map((id) => (
            <PillButton key={id} icon={departmentMeta[id].icon} active={dept === id} onClick={() => setDept(id)}>
              {departmentMeta[id].label}
            </PillButton>
          ))}
        </div>
        <div role="group" aria-label="Filtrar por estado" className="flex flex-wrap gap-2">
          {statusFilters.map((f) => (
            <PillButton key={f.id} active={status === f.id} onClick={() => setStatus(f.id)}>
              {f.label}
            </PillButton>
          ))}
        </div>
      </div>

      <div inert={selected !== null}>
        {visible.length === 0 && <p className="text-body text-ink-2">No hay agentes con esos filtros.</p>}
        <h2 className="sr-only">Agentes</h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <AnimatePresence>
            {visible.map((a, i) => (
              <AgentCard key={a.id} agent={a} delay={0.05 + i * 0.05} onOpen={() => open(a.id)} />
            ))}
          </AnimatePresence>
        </div>
      </div>

      <AnimatePresence>
        {selectedAgent && <AgentDialog key={selectedAgent.id} agent={selectedAgent} onClose={close} />}
      </AnimatePresence>
    </div>
  );
}
