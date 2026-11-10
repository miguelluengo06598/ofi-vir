import Link from "next/link";
import { headers } from "next/headers";
import { Suspense } from "react";
import { SelectorRevisorDev } from "@/components/admin/certificacion/SelectorRevisorDev";
import { listarRevisores, sesionRevisor } from "@/lib/admin/certificacion/acceso";
import { NOMBRE_CATEGORIA } from "@/lib/admin/certificacion/config";
import { dbAdminDesdeEntorno } from "@/lib/admin/entorno";

async function Quien() {
  const db = dbAdminDesdeEntorno();
  const sesion = db ? await sesionRevisor(await headers(), db) : null;
  if (!db || !sesion) return null;
  return (
    <div className="flex flex-col items-end gap-1 text-right">
      <p className="text-small">{sesion.nombre} · <span className="text-ink-2">{sesion.rol === "admin_samgple" ? "Administración" : "Revisión"}</span></p>
      <p className="text-tiny text-ink-3">Categorías: {sesion.categorias.map((c) => NOMBRE_CATEGORIA[c] ?? c).join(", ") || "ninguna"}</p>
      {sesion.esDeDesarrollo && <SelectorRevisorDev actual={sesion.userId} revisores={await listarRevisores(db)} />}
    </div>
  );
}

const enlace = "glass glass-interactive rounded-pill px-4 py-2 text-small text-white";

/** Marco del panel de certificación del equipo de SAMGPLE. El acceso lo comprueban el proxy y cada página. */
export default function CertificacionLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <nav aria-label="Panel de certificación" className="flex flex-wrap gap-2">
          <Link href="/admin/certificacion" className={enlace}>Cola de revisión</Link>
          <Link href="/admin/certificacion/calidad" className={enlace}>Control de calidad</Link>
          <Link href="/admin/certificacion/metricas" className={enlace}>Métricas del equipo</Link>
        </nav>
        <Suspense fallback={null}><Quien /></Suspense>
      </div>
      {children}
    </>
  );
}
