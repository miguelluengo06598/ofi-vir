import { Avatar, GlassPanel } from "@/components/glass";
import { agents } from "@/data/agents";
import { fmtNumber } from "@/lib/format";
import { movements } from "@/data/wallet";

export function Movements() {
  return (
    <GlassPanel as="section" aria-labelledby="movements-title" className="enter flex flex-col gap-4 p-6">
      <h2 id="movements-title" className="text-h2">
        Movimientos
      </h2>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[40rem] text-left text-small">
          <thead className="text-tiny text-ink-3">
            <tr>
              <th scope="col" className="pb-2 font-normal">Agente y tarea</th>
              <th scope="col" className="pb-2 font-normal">Fecha</th>
              <th scope="col" className="pb-2 text-right font-normal">Coste de IA</th>
              <th scope="col" className="pb-2 text-right font-normal">Tarifa del creador</th>
              <th scope="col" className="pb-2 text-right font-normal">Total</th>
            </tr>
          </thead>
          <tbody>
            {movements.map((m) => {
              const agent = agents.find((a) => a.id === m.agentId)!;
              return (
                <tr key={m.id} className="border-t border-glass-border">
                  <td className="py-3 pr-3">
                    <div className="flex items-center gap-3">
                      <Avatar name={agent.name} tone={agent.departmentId} size={32} />
                      <div className="min-w-0">
                        <p className="font-semibold">{agent.name}</p>
                        <p className="text-tiny text-ink-2">{m.task}</p>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 pr-3 whitespace-nowrap text-ink-2">{m.when}</td>
                  <td className="py-3 text-right tabular-nums">{fmtNumber(m.ai, 1)}</td>
                  <td className="py-3 text-right tabular-nums">{fmtNumber(m.fee, 1)}</td>
                  <td className="py-3 text-right font-semibold tabular-nums">{fmtNumber(m.ai + m.fee, 1)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-tiny text-ink-3">Importes en créditos.</p>
    </GlassPanel>
  );
}
