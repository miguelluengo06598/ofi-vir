import { agentConsumption } from "./wallet";

/** Actividad de la última semana y valoración que la empresa ha dado a cada agente. */
const stats: Record<string, { tasksWeek: number; rating: number }> = {
  "lucia-ramos": { tasksWeek: 62, rating: 4.8 },
  "daniel-prieto": { tasksWeek: 48, rating: 4.5 },
  "irene-soler": { tasksWeek: 19, rating: 4.6 },
  "sofia-navarro": { tasksWeek: 131, rating: 4.9 },
  "hugo-lara": { tasksWeek: 87, rating: 4.4 },
  "carla-medina": { tasksWeek: 24, rating: 4.7 },
  "alvaro-rios": { tasksWeek: 31, rating: 4.3 },
  "nuria-campos": { tasksWeek: 76, rating: 4.6 },
  "tomas-vidal": { tasksWeek: 28, rating: 4.8 },
  "elena-bravo": { tasksWeek: 9, rating: 4.7 },
};

export type AgentStats = { tasksWeek: number; rating: number | null; creditsMonth: number };

/** Los agentes recién contratados aún no tienen actividad ni valoración. */
export function getAgentStats(agentId: string): AgentStats {
  const base = stats[agentId];
  return {
    tasksWeek: base?.tasksWeek ?? 0,
    rating: base?.rating ?? null,
    creditsMonth: agentConsumption.find((c) => c.agent.id === agentId)?.credits ?? 0,
  };
}
