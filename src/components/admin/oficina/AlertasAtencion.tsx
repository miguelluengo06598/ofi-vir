import { BadgeAlert, CircleAlert, Clock, Coins, CreditCard, OctagonAlert, ServerCrash, TrendingUp, type LucideIcon } from "lucide-react";
import { GlassPanel } from "@/components/glass";
import type { Alerta, TipoAlerta } from "@/lib/admin/oficina/panorama";

const META: Record<TipoAlerta, { icono: LucideIcon; titulo: string }> = {
  sin_saldo: { icono: Coins, titulo: "Cliente sin saldo" },
  recarga_fallida: { icono: CreditCard, titulo: "Recarga automática fallida" },
  agente_suspendido: { icono: BadgeAlert, titulo: "Agente suspendido" },
  certificacion_atrasada: { icono: Clock, titulo: "Certificación atrasada" },
  errores_repetidos: { icono: OctagonAlert, titulo: "Errores repetidos" },
  coste_ia_alto: { icono: TrendingUp, titulo: "Coste de IA por encima de lo normal" },
  error_sistema: { icono: ServerCrash, titulo: "Error del sistema" },
};

const eur = (c: unknown) => `${(Number(c) / 100).toLocaleString("es-ES", { maximumFractionDigits: 2 })} €`;
const desde = (iso: string) => new Date(iso).toLocaleString("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

function detalle(a: Alerta): string | null {
  switch (a.tipo) {
    case "certificacion_atrasada": return `En cola ${String(a.detalle.espera ?? "")} (plazo ${String(a.detalle.plazoHoras ?? "")} h laborables)`;
    case "errores_repetidos": return `${String(a.detalle.fallos ?? "")} tareas fallidas en 24 h`;
    case "coste_ia_alto": return `Hoy ${eur(a.detalle.hoy_centimos)} · media diaria ${eur(a.detalle.media_centimos)}`;
    default: return null;
  }
}

/** Alertas que requieren atención, de la más urgente a la menos. La urgencia va en texto e icono, no solo en color. */
export function AlertasAtencion({ alertas }: { alertas: Alerta[] }) {
  const urgentes = alertas.filter((a) => a.urgencia === 3).length;
  return (
    <GlassPanel as="section" aria-labelledby="alertas-t" className="flex flex-col gap-3 p-4 sm:p-5">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="alertas-t" className="text-h2">Requiere atención</h2>
        <p className="text-small text-ink-2">{alertas.length} {alertas.length === 1 ? "alerta" : "alertas"} · {urgentes} urgentes</p>
      </div>
      {alertas.length === 0 ? (
        <p className="py-8 text-center text-small text-ink-2">Todo en orden. No hay nada que requiera atención.</p>
      ) : (
        <ol className="flex max-h-[34rem] flex-col gap-2 overflow-y-auto pr-1">
          {alertas.map((a, i) => {
            const { icono: Icono, titulo } = META[a.tipo];
            const urgente = a.urgencia === 3;
            const texto = detalle(a);
            return (
              <li key={`${a.tipo}-${a.empresaId}-${a.agente}-${i}`} className={`flex gap-3 rounded-card p-3 ring-1 ${urgente ? "bg-status-error/10 ring-status-error/40" : "bg-status-waiting/10 ring-status-waiting/35"}`}>
                <Icono size={18} aria-hidden="true" className={`mt-0.5 shrink-0 ${urgente ? "text-status-error" : "text-status-waiting"}`} />
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-x-2 text-small font-semibold">
                    {titulo}
                    <span className={`inline-flex items-center gap-1 rounded-pill px-2 py-0.5 text-tiny font-normal ${urgente ? "bg-status-error/20 text-status-error" : "bg-status-waiting/20 text-status-waiting"}`}>
                      <CircleAlert size={11} aria-hidden="true" /> {urgente ? "Urgente" : "Atención"}
                    </span>
                  </p>
                  <p className="truncate text-small text-ink-2">
                    {a.empresa ?? "Plataforma"}{a.agente ? ` · ${a.agente}` : ""}
                  </p>
                  {texto && <p className="text-tiny text-ink-3">{texto}</p>}
                </div>
                <time dateTime={a.desde} className="shrink-0 text-tiny text-ink-3">{desde(a.desde)}</time>
              </li>
            );
          })}
        </ol>
      )}
    </GlassPanel>
  );
}
