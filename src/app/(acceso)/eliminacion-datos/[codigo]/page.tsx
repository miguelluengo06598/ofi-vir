import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { CheckCircle2 } from "lucide-react";
import { GlassPanel } from "@/components/glass";
import { dbAdminDesdeEntorno } from "@/lib/admin/entorno";

export const metadata: Metadata = { title: "Eliminación de datos", robots: { index: false, follow: false } };

/** Estado de una solicitud de eliminación de datos que llegó desde Facebook (Meta enlaza aquí con el código). */
export default async function EliminacionDatosPage({ params }: { params: Promise<{ codigo: string }> }) {
  await connection();
  const { codigo } = await params;
  if (!/^[0-9a-f]{32}$/.test(codigo)) notFound();
  const db = dbAdminDesdeEntorno();
  const { data } = db ? await db.from("meta_data_deletion_requests").select("estado, creado_en, completado_en").eq("codigo", codigo).maybeSingle() : { data: null };
  if (!data) notFound();
  const fecha = (iso: string) => new Date(iso).toLocaleString("es-ES", { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Madrid" });
  return (
    <GlassPanel as="section" strong className="w-full max-w-md p-6 shadow-2xl sm:p-8">
      <span className="flex size-10 items-center justify-center rounded-full bg-white/15"><CheckCircle2 size={20} aria-hidden="true" /></span>
      <h1 className="mt-4 text-xl font-semibold">Solicitud de eliminación de datos</h1>
      <p className="mt-3 text-small text-ink-2">Código de confirmación: <code className="break-all text-white">{codigo}</code></p>
      <p className="mt-3 text-body">
        {data.estado === "completada"
          ? `Completada el ${fecha((data.completado_en ?? data.creado_en) as string)}.`
          : `Recibida el ${fecha(data.creado_en as string)}. La estamos tramitando.`}
      </p>
      <p className="mt-3 text-small text-ink-2">
        Hemos desconectado tu cuenta de Facebook de MyOfia, borrado los permisos de acceso que nos diste y los datos de tus páginas y formularios.
        Los contactos que ya habían llegado a la oficina de la empresa son de esa empresa: para pedir que los borre, escríbele directamente.
      </p>
    </GlassPanel>
  );
}
