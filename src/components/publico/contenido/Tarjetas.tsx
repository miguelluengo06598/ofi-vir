import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Avatar } from "@/components/glass";
import { departmentMeta } from "@/components/glass/tokens";
import { DEPARTAMENTOS, type SlugDepartamento } from "@/content/departamentos";
import { SECTORES } from "@/content/sectores";

const tarjeta = "glass glass-interactive group flex h-full flex-col overflow-hidden rounded-card text-white";

/** Una tarjeta por departamento (con la cabecera de color de la oficina) que lleva a su página. */
export function TarjetasDepartamentos({ solo }: { solo?: SlugDepartamento[] }) {
  const lista = solo ? DEPARTAMENTOS.filter((d) => solo.includes(d.slug)) : DEPARTAMENTOS;
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {lista.map((d) => {
        const meta = departmentMeta[d.tono];
        const Icono = meta.icon;
        return (
          <li key={d.slug}>
            <Link href={`/departamentos/${d.slug}`} className={tarjeta}>
              <span className={`flex items-center gap-2 px-4 py-3 text-small font-semibold ${meta.header}`}>
                <Icono size={16} aria-hidden="true" /> {d.nombre}
              </span>
              <span className="flex flex-1 flex-col gap-3 p-4">
                <span className="text-small text-ink-2">{d.linea}</span>
                <span className="flex -space-x-2" aria-hidden="true">
                  {d.agentes.map((a) => (
                    <Avatar key={a.nombre} name={a.nombre} tone={d.tono} size={32} />
                  ))}
                </span>
                <span className="mt-auto inline-flex items-center gap-1.5 text-small font-semibold">
                  Ver {d.nombre.toLowerCase()} <ArrowRight size={15} aria-hidden="true" className="transition-transform group-hover:translate-x-0.5" />
                </span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** Una tarjeta por sector que lleva a su página. */
export function TarjetasSectores() {
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {SECTORES.map((s) => {
        const Icono = s.icono;
        return (
          <li key={s.slug}>
            <Link href={`/sectores/${s.slug}`} className={`${tarjeta} gap-3 p-5`}>
              <span className="flex size-10 items-center justify-center rounded-full bg-white/10 ring-1 ring-white/15">
                <Icono size={19} aria-hidden="true" />
              </span>
              <span className="text-h2">{s.nombre}</span>
              <span className="text-small text-ink-2">{s.linea}</span>
              <span className="mt-auto inline-flex items-center gap-1.5 text-small font-semibold">
                Ver ejemplos <ArrowRight size={15} aria-hidden="true" />
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** Rejilla de tarjetas provisionales para secciones intermedias. */
export function Provisionales({ items }: { items: { titulo: string; texto: string }[] }) {
  return (
    <ul className="grid gap-4 md:grid-cols-3">
      {items.map((s) => (
        <li key={s.titulo} className="glass rounded-card p-6">
          <h3 className="text-h2">{s.titulo}</h3>
          <p className="mt-2 text-body text-ink-2">{s.texto}</p>
        </li>
      ))}
    </ul>
  );
}
