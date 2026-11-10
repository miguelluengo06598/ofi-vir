import Link from "next/link";
import { SolicitudAcceso } from "@/components/acceso/SolicitudAcceso";
import { sectorPorSlug } from "@/content/sectores";

export default async function SolicitarAccesoPage({ searchParams }: PageProps<"/solicitar-acceso">) {
  const sector = sectorPorSlug((await searchParams).sector as string);
  return (
    <div className="flex w-full justify-center">
      <div>
        <SolicitudAcceso sectorInicial={sector?.slug} />
        <p className="mt-6 text-center text-small text-ink-2">¿Ya tienes cuenta? <Link href="/login" className="text-white underline-offset-4 hover:underline">Entrar</Link></p>
      </div>
    </div>
  );
}
