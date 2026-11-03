import { CheckCircle2, CircleDashed, XCircle, type LucideIcon } from "lucide-react";
import { GlassPanel } from "@/components/glass";
import { checkServices, type ServiceState } from "@/lib/serviceStatus";

const meta: Record<ServiceState, { label: string; icon: LucideIcon; tone: string }> = {
  connected: { label: "Conectado", icon: CheckCircle2, tone: "text-status-working" },
  missing: { label: "Sin configurar", icon: CircleDashed, tone: "text-status-waiting" },
  error: { label: "Error", icon: XCircle, tone: "text-status-error" },
};

/** Estado de cada servicio. Se renderiza en el servidor: las claves no salen de él. */
export async function StatusView() {
  const services = await checkServices();
  return (
    <GlassPanel as="section" aria-label="Servicios" className="enter flex flex-col gap-1 p-6">
      <ul>
        {services.map((s) => {
          const { label, icon: Icon, tone } = meta[s.state];
          return (
            <li key={s.id} className="flex flex-col gap-1 border-t border-glass-border py-4 first:border-t-0 first:pt-0 last:pb-0">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-body font-semibold">{s.name}</h2>
                <span className={`inline-flex items-center gap-1.5 text-small font-semibold ${tone}`}>
                  <Icon size={16} aria-hidden="true" />
                  {label}
                </span>
              </div>
              <p className="text-small text-ink-2">{s.detail}</p>
              {s.missing.length > 0 && (
                <ul className="flex flex-wrap gap-2">
                  {s.missing.map((v) => (
                    <li key={v}>
                      <code className="rounded-pill bg-black/30 px-3 py-1 text-tiny">{v}</code>
                    </li>
                  ))}
                </ul>
              )}
              {s.ms !== undefined && <p className="text-tiny text-ink-3">Respondió en {s.ms} ms</p>}
            </li>
          );
        })}
      </ul>
    </GlassPanel>
  );
}
