import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { BotonAltaManual, Tablero } from "@/components/admin/comercial/Tablero";
import { CabeceraSamgple } from "@/components/admin/oficina/CabeceraSamgple";
import { NavSamgple } from "@/components/admin/oficina/NavSamgple";
import { exigirRolPlataforma } from "@/lib/admin/acceso";
import { ROLES_COMERCIAL } from "@/lib/admin/comercial/config";
import { listarSolicitudes } from "@/lib/admin/comercial/servicio";
import { dbAdminDesdeEntorno } from "@/lib/admin/entorno";

export const metadata: Metadata = { title: "Comercial · SAMGPLE", robots: { index: false, follow: false } };
export const instant = false;

export default async function Comercial() {
  const db = dbAdminDesdeEntorno();
  if (!db) notFound();
  const sesion = await exigirRolPlataforma(ROLES_COMERCIAL, await headers(), db);
  if (!sesion) notFound();
  const solicitudes = await listarSolicitudes(db);
  return (
    <div className="flex flex-col gap-5">
      <CabeceraSamgple nombre={sesion.nombre} roles={sesion.roles} />
      <NavSamgple roles={sesion.roles} actual="/admin/comercial" />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-h1">Comercial</h1>
          <p className="text-small text-ink-2">Solicitudes de acceso. Arrastra una tarjeta (o usa «Mover a…») para cambiarla de columna.</p>
        </div>
        <BotonAltaManual />
      </div>
      <Tablero solicitudes={solicitudes} />
    </div>
  );
}
