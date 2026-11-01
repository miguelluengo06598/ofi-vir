import { Avatar, GlassPanel, departmentMeta } from "@/components/glass";
import { fmtNumber } from "@/lib/format";
import { agentConsumption, departmentConsumption } from "@/data/wallet";

function Bar({ value, max, fill }: { value: number; max: number; fill: string }) {
  return (
    <div aria-hidden="true" className="h-2 flex-1 overflow-hidden rounded-full bg-white/15">
      <div className={`h-full rounded-full ${fill}`} style={{ width: `${(value / max) * 100}%` }} />
    </div>
  );
}

export function Breakdowns() {
  const agentMax = agentConsumption[0].credits;
  const deptMax = departmentConsumption[0].credits;
  const deptTotal = departmentConsumption.reduce((n, d) => n + d.credits, 0);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <GlassPanel as="section" aria-labelledby="by-agent" className="enter flex flex-col gap-4 p-6">
        <h2 id="by-agent" className="text-h2">
          Consumo por agente
        </h2>
        <ul className="flex flex-col gap-3">
          {agentConsumption.map(({ agent, credits }) => (
            <li key={agent.id} className="flex items-center gap-3 text-small">
              <Avatar name={agent.name} tone={agent.departmentId} size={28} />
              <span className="w-32 shrink-0 truncate">{agent.name}</span>
              <Bar value={credits} max={agentMax} fill="bg-accent" />
              <span className="w-16 shrink-0 text-right tabular-nums">{fmtNumber(credits)}</span>
            </li>
          ))}
        </ul>
      </GlassPanel>

      <GlassPanel as="section" aria-labelledby="by-dept" className="enter flex flex-col gap-4 p-6">
        <h2 id="by-dept" className="text-h2">
          Consumo por departamento
        </h2>
        <ul className="flex flex-col gap-3">
          {departmentConsumption.map(({ id, credits }) => {
            const meta = departmentMeta[id];
            const Icon = meta.icon;
            return (
              <li key={id} className="flex items-center gap-3 text-small">
                <Icon size={16} aria-hidden="true" className="shrink-0" />
                <span className="w-36 shrink-0 truncate">{meta.label}</span>
                <Bar value={credits} max={deptMax} fill={meta.avatar} />
                <span className="w-24 shrink-0 text-right tabular-nums">
                  {fmtNumber(credits)} <span className="text-ink-3">({Math.round((credits / deptTotal) * 100)} %)</span>
                </span>
              </li>
            );
          })}
        </ul>
      </GlassPanel>
    </div>
  );
}
