import { Gauge, Headphones, Megaphone, TrendingUp, Workflow, type LucideIcon } from "lucide-react";

export type AgentStatus = "working" | "waiting" | "paused" | "error";

export const statusMeta: Record<AgentStatus, { label: string; dot: string }> = {
  working: { label: "Trabajando", dot: "bg-status-working" },
  waiting: { label: "Espera aprobación", dot: "bg-status-waiting" },
  paused: { label: "En pausa", dot: "bg-status-paused" },
  error: { label: "Error", dot: "bg-status-error" },
};

export type DepartmentId = "ventas" | "atencion" | "marketing" | "operaciones" | "direccion";

export const departmentMeta: Record<
  DepartmentId,
  { label: string; icon: LucideIcon; header: string; avatar: string }
> = {
  ventas: {
    label: "Ventas",
    icon: TrendingUp,
    header: "bg-linear-to-br from-dept-ventas/60 to-dept-ventas/15",
    avatar: "bg-linear-to-br from-dept-ventas to-dept-ventas/50",
  },
  atencion: {
    label: "Atención al cliente",
    icon: Headphones,
    header: "bg-linear-to-br from-dept-atencion/60 to-dept-atencion/15",
    avatar: "bg-linear-to-br from-dept-atencion to-dept-atencion/50",
  },
  marketing: {
    label: "Marketing",
    icon: Megaphone,
    header: "bg-linear-to-br from-dept-marketing/60 to-dept-marketing/15",
    avatar: "bg-linear-to-br from-dept-marketing to-dept-marketing/50",
  },
  operaciones: {
    label: "Operaciones · CRM",
    icon: Workflow,
    header: "bg-linear-to-br from-dept-operaciones/60 to-dept-operaciones/15",
    avatar: "bg-linear-to-br from-dept-operaciones to-dept-operaciones/50",
  },
  direccion: {
    label: "Dirección",
    icon: Gauge,
    header: "bg-linear-to-br from-dept-direccion/60 to-dept-direccion/15",
    avatar: "bg-linear-to-br from-dept-direccion to-dept-direccion/50",
  },
};

/** Entrada común: fade + 12px + blur que se aclara (300 ms, ease-out). */
export const enterMotion = {
  initial: { opacity: 0, y: 12, filter: "blur(8px)" },
  animate: { opacity: 1, y: 0, filter: "blur(0px)" },
  transition: { duration: 0.3, ease: "easeOut" as const },
};
