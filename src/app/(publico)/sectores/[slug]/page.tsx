import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PaginaSector } from "@/components/publico/sectores/PaginaSector";
import { SECTORES, sectorPorSlug } from "@/content/sectores";

// Todos los slugs válidos se prerenderizan y cualquier otro da 404.
export const instant = false;

export function generateStaticParams() {
  return SECTORES.map((s) => ({ slug: s.slug }));
}

export async function generateMetadata({ params }: PageProps<"/sectores/[slug]">): Promise<Metadata> {
  const s = sectorPorSlug((await params).slug);
  return s ? { title: s.nombre, description: s.titular + ". " + s.linea } : {};
}

export default async function Sector({ params }: PageProps<"/sectores/[slug]">) {
  const s = sectorPorSlug((await params).slug);
  if (!s) notFound();
  return <PaginaSector sector={s} />;
}
