import { BalancePanel } from "./BalancePanel";
import { Breakdowns } from "./Breakdowns";
import { ConsumptionChart } from "./ConsumptionChart";
import { LimitPanel } from "./LimitPanel";
import { Movements } from "./Movements";

export function WalletView() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-h1">Créditos</h1>
        <p className="text-body text-ink-2">Tus créditos, tu consumo y tus movimientos</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
        <BalancePanel />
        <LimitPanel />
      </div>
      <ConsumptionChart />
      <Breakdowns />
      <Movements />
    </div>
  );
}
