import type { ReactNode } from "react";
import { GlassPanel } from "@/components/glass";

/** Panel de sección con título enlazado (lectores de pantalla navegan por regiones con nombre). */
export function Seccion({ id, titulo, acciones, children, className = "" }: {
  id: string; titulo: ReactNode; acciones?: ReactNode; children: ReactNode; className?: string;
}) {
  return (
    <GlassPanel as="section" aria-labelledby={`${id}-titulo`} className={`enter flex flex-col gap-4 p-5 sm:p-6 ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={`${id}-titulo`} className="text-h2">{titulo}</h2>
        {acciones}
      </div>
      {children}
    </GlassPanel>
  );
}

/** Barra de reparto. El valor siempre va también en texto: la barra es solo apoyo visual. */
export function Barra({ valor, max, etiqueta, color = "bg-accent" }: { valor: number; max: number; etiqueta: string; color?: string }) {
  const pct = max > 0 ? Math.max(2, Math.round((valor / max) * 100)) : 0;
  return (
    <div role="img" aria-label={etiqueta} className="h-2 overflow-hidden rounded-full bg-white/15">
      <div className={`h-full rounded-full transition-[width] duration-300 ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Vacio({ children }: { children: ReactNode }) {
  return <p className="rounded-card bg-white/6 p-4 text-small text-ink-2">{children}</p>;
}

/** Mensaje de resultado; role=status para que se anuncie sin quitar el foco. */
export function Aviso({ tono, children }: { tono: "ok" | "error" | "aviso"; children: ReactNode }) {
  const c = { ok: "text-status-working", error: "text-status-error", aviso: "text-status-waiting" }[tono];
  return <p role={tono === "error" ? "alert" : "status"} className={`text-small ${c}`}>{children}</p>;
}
