import { agents } from "./agents";
import { departmentOrder } from "./departments";
import type { DepartmentId } from "@/components/glass";

/** 1 € = 100 créditos. */
export const CREDITS_PER_EUR = 100;
export const initialBalance = 12480;
export const initialMonthlyLimitEur = 150;
export const topUpAmounts = [20, 50, 100] as const;

const todayCredits = agents.reduce((n, a) => n + a.creditsToday, 0);

/** Consumo diario de los últimos 30 días (el último es hoy). Serie fija para que el servidor y el cliente coincidan. */
export const dailyConsumption: number[] = Array.from({ length: 30 }, (_, i) => {
  if (i === 29) return todayCredits;
  const weekend = i % 7 === 5 || i % 7 === 6;
  return Math.round(340 + 70 * Math.sin(i * 0.9) + (i % 5) * 9 - (weekend ? 130 : 0));
});

export const monthSpent = dailyConsumption.reduce((n, v) => n + v, 0);

/** Reparto del consumo de 30 días proporcional al gasto de hoy de cada agente. */
export const agentConsumption = agents
  .map((a) => ({ agent: a, credits: Math.round((monthSpent * a.creditsToday) / todayCredits) }))
  .sort((x, y) => y.credits - x.credits);

export const departmentConsumption: { id: DepartmentId; credits: number }[] = departmentOrder
  .map((id) => ({
    id,
    credits: agentConsumption.filter((c) => c.agent.departmentId === id).reduce((n, c) => n + c.credits, 0),
  }))
  .sort((x, y) => y.credits - x.credits);

export type Movement = {
  id: string;
  agentId: string;
  task: string;
  when: string;
  /** Coste de IA (tokens), en créditos. */
  ai: number;
  /** Tarifa del creador, en créditos. */
  fee: number;
};

export const movements: Movement[] = [
  { id: "m1", agentId: "lucia-ramos", task: "Seguimiento a 5 leads del webinar", when: "Hoy · 10:42", ai: 1.8, fee: 1.4 },
  { id: "m2", agentId: "sofia-navarro", task: "Respuesta a 9 conversaciones del chat web", when: "Hoy · 10:15", ai: 4.2, fee: 2.7 },
  { id: "m3", agentId: "carla-medina", task: "Borrador del boletín de noviembre", when: "Hoy · 09:05", ai: 3.9, fee: 2.1 },
  { id: "m4", agentId: "tomas-vidal", task: "Emisión de 3 facturas del cierre de mes", when: "Hoy · 08:50", ai: 1.1, fee: 0.8 },
  { id: "m5", agentId: "elena-bravo", task: "Cuadro de mando de ventas y gasto", when: "Hoy · 08:30", ai: 4.6, fee: 2.2 },
  { id: "m6", agentId: "daniel-prieto", task: "Puntuación de 23 contactos nuevos", when: "Ayer · 18:20", ai: 1.3, fee: 0.9 },
  { id: "m7", agentId: "irene-soler", task: "Propuesta para Clínica Sol", when: "Ayer · 17:10", ai: 4.8, fee: 3.1 },
  { id: "m8", agentId: "hugo-lara", task: "Clasificación de 31 correos de soporte", when: "Ayer · 16:45", ai: 0.6, fee: 0.4 },
  { id: "m9", agentId: "nuria-campos", task: "Actualización de 120 fichas de clientes", when: "Ayer · 15:30", ai: 0.8, fee: 0.5 },
  { id: "m10", agentId: "alvaro-rios", task: "Análisis de la campaña de otoño", when: "Ayer · 12:05", ai: 2.9, fee: 1.8 },
  { id: "m11", agentId: "lucia-ramos", task: "Seguimiento a 9 leads del webinar", when: "Hace 2 días", ai: 2.4, fee: 1.9 },
  { id: "m12", agentId: "sofia-navarro", task: "Resumen de incidencias de la semana", when: "Hace 2 días", ai: 1.5, fee: 0.9 },
];
