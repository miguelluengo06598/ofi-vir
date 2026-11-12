"use client";

import { Coins } from "lucide-react";
import { useMemo, useState } from "react";
import {
  Avatar,
  GlassPanel,
  PillButton,
  StatusBadge,
  departmentMeta,
  type AgentStatus,
  type DepartmentId,
} from "@/components/glass";
import { useApprovals } from "@/components/ApprovalsProvider";
import { departmentOrder } from "@/data/departments";
import { buildTasks, type OfficeTask, type TaskStatus } from "@/data/tasks";
import { fmtNumber } from "@/lib/format";
import { TareasReales } from "./TareasReales";

const groups: { status: TaskStatus; title: string; badge: AgentStatus | null; empty: string }[] = [
  { status: "running", title: "En curso", badge: "working", empty: "Ningún agente está trabajando ahora mismo." },
  { status: "expert", title: "Con el experto", badge: "expert", empty: "Ningún agente espera la respuesta de su creador." },
  { status: "approval", title: "Pendientes de aprobación", badge: "waiting", empty: "No hay nada pendiente de aprobar." },
  { status: "done", title: "Completadas hoy", badge: null, empty: "Todavía no se ha completado ninguna tarea hoy." },
];

function TaskRow({ task, name }: { task: OfficeTask; name: string }) {
  const dept = departmentMeta[task.departmentId];
  const Icon = dept.icon;
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-glass-border py-3 first:border-t-0">
      <Avatar name={name} tone={task.departmentId} size={36} />
      <div className="min-w-0 flex-1 basis-56">
        <p className="text-small font-semibold">{task.title}</p>
        <p className="text-tiny text-ink-2">
          {name} ·{" "}
          <span className="inline-flex items-center gap-1">
            <Icon size={12} aria-hidden="true" />
            {dept.label}
          </span>
        </p>
        {task.porque && <p className="text-tiny text-ink-3">Empezó por: {task.porque}</p>}
      </div>
      <p className="inline-flex items-center gap-1 text-small tabular-nums">
        <Coins size={14} aria-hidden="true" className="text-ink-2" />
        {task.status === "done" ? "" : "~"}
        {fmtNumber(task.cost, 1)} créditos
      </p>
      <p className="min-w-28 text-right text-small text-ink-2">{task.time}</p>
    </li>
  );
}

export function TasksView() {
  const { office, resolved, consultations, modoReal } = useApprovals();
  const [dept, setDept] = useState<DepartmentId | "all">("all");

  const agents = office.summaries.flatMap((s) => s.agents);
  const tasks = useMemo(() => (modoReal ? [] : buildTasks(agents, resolved, consultations)), [modoReal, agents, resolved, consultations]);
  const visible = tasks.filter((t) => dept === "all" || t.departmentId === dept);

  // Oficina real: solo las tareas de la base (las de ejemplo solo existen en las demos de la web).
  if (modoReal) {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-1">
          <h1 className="text-h1">Tareas</h1>
          <p className="text-body text-ink-2">Lo que están haciendo tus agentes</p>
        </div>
        <TareasReales vacio />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-h1">Tareas</h1>
        <p className="text-body text-ink-2">Lo que están haciendo tus agentes</p>
      </div>

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

      <TareasReales />

      <div className="flex flex-col gap-4">
        {groups.map((g) => {
          const items = visible.filter((t) => t.status === g.status);
          return (
            <GlassPanel
              as="section"
              key={g.status}
              aria-labelledby={`tasks-${g.status}`}
              className="enter flex flex-col gap-2 p-6"
            >
              <div className="flex items-center justify-between gap-3">
                <h2 id={`tasks-${g.status}`} className="text-h2">
                  {g.title} <span className="text-small font-normal text-ink-2">({items.length})</span>
                </h2>
                {g.badge && <StatusBadge status={g.badge} />}
              </div>
              {items.length === 0 ? (
                <p className="text-small text-ink-2">{g.empty}</p>
              ) : (
                <ul>
                  {items.map((t) => (
                    <TaskRow key={t.id} task={t} name={agents.find((a) => a.id === t.agentId)!.name} />
                  ))}
                </ul>
              )}
            </GlassPanel>
          );
        })}
      </div>
    </div>
  );
}
