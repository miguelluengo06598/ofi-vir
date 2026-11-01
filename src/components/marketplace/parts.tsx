import { BadgeCheck, Building2, Coins, Star } from "lucide-react";
import { Avatar, departmentMeta } from "@/components/glass";
import { categoryDepartment, type MarketAgent } from "@/data/marketplace";

const fmt = (n: number) => n.toLocaleString("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export const agentTone = (a: MarketAgent) => categoryDepartment[a.category];

export function Rating({ value, count }: { value: number; count?: number }) {
  return (
    <span className="inline-flex items-center gap-1" aria-label={`Valoración ${fmt(value)} de 5`}>
      <Star size={14} aria-hidden="true" className="fill-status-waiting text-status-waiting" />
      {fmt(value)}
      {count !== undefined && <span className="text-ink-3">({count})</span>}
    </span>
  );
}

/** Creador con su avatar y la insignia «Certificado». Sin fotos reales: se usan iniciales. */
export function CreatorBadge({ agent }: { agent: MarketAgent }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-small">
      <Avatar name={agent.creator} tone={agentTone(agent)} size={24} />
      <span>{agent.creator}</span>
      <span className="inline-flex items-center gap-1 rounded-pill bg-accent/30 px-2 py-0.5 text-tiny">
        <BadgeCheck size={12} aria-hidden="true" />
        Certificado
      </span>
    </div>
  );
}

export function Stats({ agent }: { agent: MarketAgent }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-tiny text-ink-2">
      <li>
        <Rating value={agent.rating} count={agent.ratingCount} />
      </li>
      <li className="inline-flex items-center gap-1">
        <Building2 size={14} aria-hidden="true" />
        {agent.companies.toLocaleString("es-ES")} empresas
      </li>
      <li className="inline-flex items-center gap-1">
        <Coins size={14} aria-hidden="true" />
        {fmt(agent.avgCost)} créditos/tarea
      </li>
    </ul>
  );
}

export const categoryLabel = (a: MarketAgent) => departmentMeta[agentTone(a)].label;
