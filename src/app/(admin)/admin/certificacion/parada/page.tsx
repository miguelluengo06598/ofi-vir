import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ParadaEmergencia } from "@/components/admin/ParadaEmergencia";
import { Seccion } from "@/components/admin/certificacion/piezas";
import { sesionRevisor } from "@/lib/admin/certificacion/acceso";
import { dbAdminDesdeEntorno } from "@/lib/admin/entorno";
import { leerParada } from "@/lib/admin/parada";

/** Con cacheComponents, lo que lee cabeceras va dentro de Suspense. */
export default function Page() {
  return <Suspense fallback={<p role="status" className="text-body text-ink-2">Cargando…</p>}><Parada /></Suspense>;
}

async function Parada() {
  const db = dbAdminDesdeEntorno();
  const sesion = db ? await sesionRevisor(await headers(), db) : null;
  if (!db || !sesion) notFound();
  const estado = await leerParada(db);
  return (
    <>
      <header>
        <h1 className="text-h1">Parada de emergencia</h1>
        <p className="text-body text-ink-2">Detiene al momento todos los agentes de todas las empresas: las tareas en curso se paran antes de su siguiente llamada a la IA y las que esperan no empiezan. Además del botón, la variable de entorno AGENTES_ACTIVOS=false apaga los agentes del servidor aunque la base diga lo contrario.</p>
      </header>
      <Seccion id="parada" titulo="Estado">
        <ParadaEmergencia inicial={{ ...estado, puedeCambiar: sesion.rol === "admin_samgple" }} />
      </Seccion>
    </>
  );
}
