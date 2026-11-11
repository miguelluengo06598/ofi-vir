import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { AsistenteAlta, type InicialAlta } from "@/components/admin/comercial/AsistenteAlta";
import { exigirRolPlataforma } from "@/lib/admin/acceso";
import { plantillasDisponibles } from "@/lib/admin/comercial/alta";
import { ROLES_COMERCIAL } from "@/lib/admin/comercial/config";
import { equipoSamgple, fichaSolicitud } from "@/lib/admin/comercial/servicio";
import { dbAdminDesdeEntorno } from "@/lib/admin/entorno";
import { getPacks } from "@/lib/creditos/packs";

export const metadata: Metadata = { title: "Alta de cliente · MyOfia", robots: { index: false, follow: false } };
export const instant = false;

export default async function AltaCliente({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const db = dbAdminDesdeEntorno();
  if (!db) notFound();
  const sesion = await exigirRolPlataforma(ROLES_COMERCIAL, await headers(), db);
  if (!sesion) notFound();
  const { solicitud } = await searchParams;
  const id = typeof solicitud === "string" && /^[0-9a-f-]{36}$/i.test(solicitud) ? solicitud : null;
  const [ficha, plantillas, equipo, packs] = await Promise.all([id ? fichaSolicitud(db, id) : null, plantillasDisponibles(db), equipoSamgple(db), getPacks()]);
  if (id && (!ficha || ficha.solicitud.estado === "cliente")) notFound();
  const s = ficha?.solicitud;
  const inicial: InicialAlta = {
    solicitudId: s?.id ?? null, empresa: s?.empresa ?? "", sector: s?.sector ?? "", tamano: s?.tamano ?? "", web: s?.web ?? "",
    nombre: s?.nombre ?? "", email: s?.email ?? "",
  };
  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link href="/admin/comercial" className="text-small text-ink-2 underline-offset-4 hover:underline">← Comercial</Link>
        <h1 className="mt-1 text-h1">{s ? `Alta de ${s.empresa ?? s.nombre}` : "Alta manual de cliente"}</h1>
        <p className="text-small text-ink-2">{s ? "Datos tomados de su solicitud: revísalos." : "Para clientes que no vienen de la web."} Nada se guarda hasta «Dar de alta».</p>
      </div>
      <AsistenteAlta
        inicial={inicial}
        plantillas={plantillas}
        equipo={equipo}
        yo={sesion.userId}
        packs={packs.filter((p) => !p.soloUnaVez).map((p) => ({ id: p.id, nombre: p.nombre, creditos: p.creditos, dias: p.diasCaducidad }))}
      />
    </div>
  );
}
