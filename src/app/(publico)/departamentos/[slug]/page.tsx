import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Avatar } from "@/components/glass";
import { Provisionales } from "@/components/publico/contenido/Tarjetas";
import { Bloque, PaginaSeccion } from "@/components/publico/plantilla/PaginaSeccion";
import { DEPARTAMENTOS, departamentoPorSlug } from "@/content/departamentos";
import { PaginaDepartamento } from "@/components/publico/departamento/PaginaDepartamento";

// Todos los slugs válidos se prerenderizan (generateStaticParams) y cualquier otro da 404, así que leer
// params sin <Suspense> no bloquea a nadie; con <Suspense> se perdería el morph del panel entre páginas.
export const instant = false;

export function generateStaticParams() {
  return DEPARTAMENTOS.map((d) => ({ slug: d.slug }));
}

export async function generateMetadata({ params }: PageProps<"/departamentos/[slug]">): Promise<Metadata> {
  const d = departamentoPorSlug((await params).slug);
  return d ? { title: d.nombre, description: `${d.titular}. ${d.subtitulo}` } : {};
}

export default async function Departamento({ params }: PageProps<"/departamentos/[slug]">) {
  const d = departamentoPorSlug((await params).slug);
  if (!d) notFound();
  if (d.ficha) return <PaginaDepartamento d={d} ficha={d.ficha} />;
  return (
    <PaginaSeccion
      ruta={`/departamentos/${d.slug}`}
      antetitulo={`Departamento · ${d.nombre}`}
      titular={d.titular}
      subtitulo={d.subtitulo}
      video={d.video}
      secundario={{ href: "/departamentos", label: "Todos los departamentos" }}
      provisional
    >
      <Bloque id="agentes" titulo="Sus agentes">
        <ul className="grid gap-4 md:grid-cols-3">
          {d.agentes.map((a) => (
            <li key={a.nombre} className="glass flex gap-4 rounded-card p-5">
              <Avatar name={a.nombre} tone={d.tono} size={44} />
              <div>
                <p className="text-body font-semibold">{a.nombre} <span className="font-normal text-ink-2">· {a.rol}</span></p>
                <p className="mt-1 text-small text-ink-2">{a.hace}</p>
              </div>
            </li>
          ))}
        </ul>
      </Bloque>
      <Bloque id="que-hace" titulo="Qué hace por ti">
        <Provisionales items={d.secciones} />
      </Bloque>
    </PaginaSeccion>
  );
}
