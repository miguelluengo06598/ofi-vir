import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { GlassPanel } from "@/components/glass";
import { tipo } from "@/components/marketing/tipografia";
import { DEPARTAMENTOS } from "@/content/departamentos";
import { LEGALES, MENU } from "@/content/navegacion";
import { SECTORES } from "@/content/sectores";
import { CONTACTO_EMAIL } from "@/data/publico";

function Columna({ titulo, enlaces }: { titulo: string; enlaces: readonly { href: string; label: string }[] }) {
  return (
    <nav aria-label={titulo}>
      <p className="mb-3 text-small font-semibold">{titulo}</p>
      <ul className="flex flex-col gap-2 text-small text-ink-2">
        {enlaces.map((e) => (
          <li key={e.href}>
            <Link href={e.href} className="hover:text-white">{e.label}</Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Pie común: frase de cierre, todas las páginas, legales, autoría y «Solicitar acceso». */
export function PiePublico() {
  return (
    <footer className="mx-auto w-full max-w-7xl px-4 pt-10 pb-8">
      <GlassPanel className="p-6 sm:p-10">
        <div className="flex flex-col gap-6 border-b border-white/10 pb-8 md:flex-row md:items-end md:justify-between">
          <p className={`max-w-2xl text-balance ${tipo.subtitular}`}>Una persona con agentes rinde como tres. Lo importante lo apruebas tú.</p>
          <Link href="/solicitar-acceso" className="inline-flex shrink-0 items-center gap-2 self-start rounded-pill bg-white px-6 py-3 text-body font-semibold text-black hover:bg-white/90 md:self-auto">
            Solicitar acceso <ArrowRight size={18} aria-hidden="true" />
          </Link>
        </div>

        <div className="grid gap-8 pt-8 sm:grid-cols-2 lg:grid-cols-4">
          <Columna titulo="Producto" enlaces={[{ href: "/", label: "Inicio" }, ...MENU.filter((e) => !e.mega)]} />
          <Columna titulo="Departamentos" enlaces={[{ href: "/departamentos", label: "Todos" }, ...DEPARTAMENTOS.map((d) => ({ href: `/departamentos/${d.slug}`, label: d.nombre }))]} />
          <Columna titulo="Sectores" enlaces={[{ href: "/sectores", label: "Todos" }, ...SECTORES.map((s) => ({ href: `/sectores/${s.slug}`, label: s.nombre }))]} />
          <Columna titulo="Legal" enlaces={LEGALES} />
        </div>

        <div className="mt-8 flex flex-col gap-2 border-t border-white/10 pt-6 text-small text-ink-2 sm:flex-row sm:justify-between">
          <p>SAMGPLE · Tu equipo de IA, organizado por departamentos.</p>
          <p>
            Contacto:{" "}
            <a href={`mailto:${CONTACTO_EMAIL}`} className="text-white underline underline-offset-4">{CONTACTO_EMAIL}</a>
            {" · "}
            <Link href="/login" className="text-white underline underline-offset-4">Iniciar sesión</Link>
          </p>
        </div>
      </GlassPanel>
    </footer>
  );
}
