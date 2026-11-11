import Link from "next/link";
import { Building2, LogOut, ShieldCheck } from "lucide-react";
import { cerrarSesion } from "@/app/(acceso)/acciones";
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

const boton = "inline-flex items-center gap-1.5 rounded-pill px-3 py-1.5 text-small ring-1 ring-white/20 hover:bg-white/10";

/** Distintivo «MyOfia · Administración», quién eres, el acceso a tu propia oficina y cerrar sesión. Va en todas las pantallas. */
export function CabeceraSamgple({ nombre, roles, miOficina }: { nombre: string; roles: RolPlataforma[]; miOficina: boolean }) {
  return (
    <GlassPanel className="flex flex-wrap items-center justify-between gap-3 rounded-panel! px-4 py-2.5" style={{ boxShadow: `inset 0 0 0 1px ${ACENTO_ADMIN}55, var(--glass-shadow)` }}>
      <p className="flex items-center gap-2.5">
        <span className="inline-flex items-center gap-1.5 rounded-pill px-3 py-1 text-small font-semibold text-black" style={{ background: ACENTO_ADMIN }}>
          <ShieldCheck size={15} aria-hidden="true" /> MyOfia · Administración
        </span>
        <span className="text-small text-ink-2">
          <span className="text-white">{nombre}</span> · {roles.map((r) => NOMBRE_ROL[r]).join(", ")}
        </span>
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {miOficina && (
          <Link href="/admin/mi-oficina" className={boton}>
            <Building2 size={15} aria-hidden="true" /> Mi oficina
          </Link>
        )}
        <form action={cerrarSesion}>
          <button type="submit" className={boton}>
            <LogOut size={15} aria-hidden="true" /> Cerrar sesión
          </button>
        </form>
      </div>
    </GlassPanel>
  );
}
