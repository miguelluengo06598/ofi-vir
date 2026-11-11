import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { BotonAltaManual, Tablero } from "@/components/admin/comercial/Tablero";
import { exigirRolPlataforma } from "@/lib/admin/acceso";
import { ROLES_COMERCIAL } from "@/lib/admin/comercial/config";
import { listarSolicitudes } from "@/lib/admin/comercial/servicio";
import { dbAdminDesdeEntorno } from "@/lib/admin/entorno";

export const metadata: Metadata = { title: "Comercial · MyOfia", robots: { index: false, follow: false } };
export const instant = false;

export default async function Comercial() {
  const db = dbAdminDesdeEntorno();
  if (!db) notFound();
  const sesion = await exigirRolPlataforma(ROLES_COMERCIAL, await headers(), db);
  if (!sesion) notFound();
  const solicitudes = await listarSolicitudes(db);
  return (
    <div className="flex flex-col gap-5">
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
