import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { AlertasAtencion } from "@/components/admin/oficina/AlertasAtencion";
import { BarraPanorama } from "@/components/admin/oficina/BarraPanorama";
import { EnDirectoPlataforma } from "@/components/admin/oficina/EnDirectoPlataforma";
import { exigirRolPlataforma, ROLES_PLATAFORMA } from "@/lib/admin/acceso";
import { dbAdminDesdeEntorno } from "@/lib/admin/entorno";
import { alertasAtencion, indicadoresPanorama, seriesPanorama, sucesosEnDirecto } from "@/lib/admin/oficina/panorama";
import { cargarEnDirecto } from "./oficina-acciones";

export const metadata: Metadata = { title: "Oficina de MyOfia", robots: { index: false, follow: false } };
// Datos por persona y en vivo: no se prerenderiza.
export const instant = false;

/**
 * Pantalla principal de la oficina de MyOfia: Panorama, alertas que requieren atención y En directo.
 * Todo sale de funciones SQL de agregados y se filtra por el rol de la persona en el servidor.
 */
export default async function OficinaSamgple() {
  const db = dbAdminDesdeEntorno();
  if (!db) notFound();
  const sesion = await exigirRolPlataforma(ROLES_PLATAFORMA, await headers(), db);
  if (!sesion) notFound();

  const [indicadores, series, alertas, sucesos] = await Promise.all([
    indicadoresPanorama(db, sesion.roles),
    seriesPanorama(db, sesion.roles),
    alertasAtencion(db, sesion.roles),
    sucesosEnDirecto(db, sesion.roles),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <BarraPanorama indicadores={indicadores} series={series} />
      <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr] lg:items-start">
        <AlertasAtencion alertas={alertas} />
        <EnDirectoPlataforma iniciales={sucesos} cargar={cargarEnDirecto} />
      </div>
    </div>
  );
}
