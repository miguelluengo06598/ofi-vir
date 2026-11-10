import { ShieldCheck } from "lucide-react";
import { GlassPanel } from "@/components/glass";
import type { RolPlataforma } from "@/lib/admin/acceso";

/**
 * Acento propio del modo administración (lila): no lo usa la oficina de los clientes (azul #4F8CFF), así
 * que la sala de control nunca se confunde con una oficina de cliente.
 */
export const ACENTO_ADMIN = "#D8B4FE";

const NOMBRE_ROL: Record<RolPlataforma, string> = {
  admin_samgple: "Administración",
  comercial_samgple: "Comercial",
  implantacion_samgple: "Implantación",
  revisor_samgple: "Certificación",
  soporte_samgple: "Soporte",
  finanzas_samgple: "Finanzas",
};

/** Distintivo «SAMGPLE · Administración» y saludo con los roles de la persona. */
export function CabeceraSamgple({ nombre, roles }: { nombre: string; roles: RolPlataforma[] }) {
  return (
    <GlassPanel className="flex flex-wrap items-center justify-between gap-3 rounded-pill! px-4 py-2.5" style={{ boxShadow: `inset 0 0 0 1px ${ACENTO_ADMIN}55, var(--glass-shadow)` }}>
      <p className="flex items-center gap-2.5">
        <span className="inline-flex items-center gap-1.5 rounded-pill px-3 py-1 text-small font-semibold text-black" style={{ background: ACENTO_ADMIN }}>
          <ShieldCheck size={15} aria-hidden="true" /> SAMGPLE · Administración
        </span>
        <span className="hidden text-small text-ink-2 sm:inline">La oficina de SAMGPLE</span>
      </p>
      <p className="text-small text-ink-2">
        <span className="text-white">{nombre}</span> · {roles.map((r) => NOMBRE_ROL[r]).join(", ")}
      </p>
    </GlassPanel>
  );
}
