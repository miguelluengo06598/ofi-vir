import Link from "next/link";
import { ArrowLeft, ArrowRight, Check, Hand, Lock } from "lucide-react";
import { departmentMeta } from "@/components/glass/tokens";
import { GlassPanel } from "@/components/glass";
import { RevelarTexto } from "@/components/marketing/RevelarTexto";
import { sobreEscena, tipo } from "@/components/marketing/tipografia";
import { DEPARTAMENTOS, type DepartamentoPublico, type FichaDepartamento } from "@/content/departamentos";
import { EquipoGiratorio } from "./EquipoGiratorio";
import { HeroDepartamento } from "./HeroDepartamento";
import { PorRevisar } from "./PorRevisar";
import { SeConectaCon } from "./SeConectaCon";
import { UnDia } from "./UnDia";

function Titulo({ id, ante, titulo, intro }: { id: string; ante: string; titulo: string; intro?: string }) {
  return (
    <div className={`mb-10 max-w-2xl ${sobreEscena}`}>
      <p className={tipo.antetitulo}>{ante}</p>
      <h2 id={`${id}-t`} className={`mt-2 text-balance ${tipo.titular}`}>{titulo}</h2>
      {intro && <p className={`mt-4 ${tipo.entradilla}`}>{intro}</p>}
    </div>
  );
}

/** Plantilla común de /departamentos/[slug] para los departamentos con `ficha`. */
export function PaginaDepartamento({ d, ficha }: { d: DepartamentoPublico; ficha: FichaDepartamento }) {
  const i = DEPARTAMENTOS.findIndex((x) => x.slug === d.slug);
  const anterior = DEPARTAMENTOS[(i - 1 + DEPARTAMENTOS.length) % DEPARTAMENTOS.length];
  const siguiente = DEPARTAMENTOS[(i + 1) % DEPARTAMENTOS.length];
  const sinPlantilla = ficha.agentes.filter((a) => !a.plantilla).map((a) => a.nombre);
  const columnas = [
    { titulo: "Lo hace solo", icono: Check, color: "text-status-working", items: ficha.permisos.sola },
    { titulo: "Te pide aprobación", icono: Hand, color: "text-status-waiting", items: ficha.permisos.aprobacion },
    { titulo: "Nunca lo hace", icono: Lock, color: "text-status-paused", items: ficha.permisos.nunca },
  ];
  return (
    <>
      <HeroDepartamento d={d} ficha={ficha} />

      <section id="problema" aria-label="El problema" className="mx-auto flex min-h-[70svh] w-full max-w-5xl scroll-mt-24 flex-col justify-center px-4 py-20">
        <p className={`${tipo.antetitulo} ${sobreEscena}`}>El problema</p>
        <RevelarTexto as="h2" texto={ficha.problema.titulo} className={`mt-3 text-balance ${tipo.titular} ${sobreEscena}`} />
        <p className={`mt-6 max-w-3xl ${tipo.entradilla} ${sobreEscena}`}>{ficha.problema.texto}</p>
        <PorRevisar revisar={ficha.problema.revisar} className="mt-4" />
      </section>

      <section id="equipo" aria-labelledby="equipo-t" className="mx-auto w-full max-w-7xl scroll-mt-24 px-4 py-16 sm:py-20">
        <Titulo id="equipo" ante="Conoce a tu equipo" titulo={`${ficha.agentes.length} agentes, cada uno con su trabajo`} intro="Pasa el ratón por encima, o toca la tarjeta, para ver qué hace cada uno." />
        <EquipoGiratorio agentes={ficha.agentes} tono={d.tono} acento={ficha.acento} />
      </section>

      <section id="un-dia" aria-labelledby="un-dia-t" className="mx-auto w-full max-w-7xl scroll-mt-24 px-4 py-16 sm:py-24">
        <Titulo id="un-dia" ante={`Un día con ${d.nombre}`} titulo="De la primera hora a la noche del viernes" intro="Así se reparte el trabajo en un día normal. Lo que llega fuera de horario también tiene respuesta, con la regla que tú elijas." />
        <UnDia momentos={ficha.dia} acento={ficha.acento} />
      </section>

      <section id="conexiones" aria-labelledby="conexiones-t" className="mx-auto w-full max-w-7xl scroll-mt-24 px-4 py-16 sm:py-20">
        <Titulo id="conexiones" ante="Se conecta con" titulo="Trabaja donde ya trabajas tú" intro="Tus herramientas de siempre y los demás departamentos de la oficina." />
        <SeConectaCon tono={d.tono} nombre={d.nombre} ficha={ficha} />
      </section>

      <section id="tu-decides" aria-labelledby="tu-decides-t" className="mx-auto w-full max-w-7xl scroll-mt-24 px-4 py-16 sm:py-20">
        <Titulo id="tu-decides" ante="Tú decides" titulo="Lo importante te espera" intro="Así viene por defecto. Puedes endurecer cualquier permiso: lo que hace solo puede pasar a pedirte aprobación." />
        {sinPlantilla.length > 0 && (
          <PorRevisar className="mb-4" revisar={`Permisos de la plantilla de Lucía. Los de ${sinPlantilla.join(" y ")} se definirán con sus plantillas.`} />
        )}
        <div className="grid gap-4 md:grid-cols-3">
          {columnas.map((c) => (
            <GlassPanel key={c.titulo} className="rounded-card! p-6">
              <h3 className={`flex items-center gap-2 text-[19px] font-semibold`}>
                <c.icono size={18} aria-hidden="true" className={c.color} /> {c.titulo}
              </h3>
              <ul className="mt-4 space-y-3">
                {c.items.map((it) => (
                  <li key={it.texto} className="text-[15px] leading-snug text-white/90">
                    {it.texto}
                    {"fija" in it && it.fija === true && <span className="mt-1 block text-tiny text-ink-3">Siempre con aprobación</span>}
                    <PorRevisar revisar={it.revisar} className="mt-1" />
                  </li>
                ))}
              </ul>
            </GlassPanel>
          ))}
        </div>
      </section>

      <section aria-labelledby="final-t" className="mx-auto flex min-h-[70svh] w-full max-w-4xl flex-col items-center justify-center px-4 py-20 text-center">
        <h2 id="final-t" className={`text-balance ${tipo.titular} ${sobreEscena}`}>{ficha.final.titular}</h2>
        <p className={`mt-5 max-w-xl ${tipo.entradilla} ${sobreEscena}`}>{ficha.final.texto}</p>
        <Link href="/solicitar-acceso" className="mt-8 inline-flex items-center gap-2 rounded-pill bg-white px-7 py-3.5 text-body font-semibold text-black hover:bg-white/90">
          Solicitar acceso <ArrowRight size={18} aria-hidden="true" />
        </Link>
      </section>

      <nav aria-label="Otros departamentos" className="mx-auto flex w-full max-w-7xl flex-col gap-3 px-4 pt-4 pb-8 sm:flex-row">
        {[{ d: anterior, rel: "prev", txt: "Departamento anterior" }, { d: siguiente, rel: "next", txt: "Departamento siguiente" }].map(({ d: o, rel, txt }) => {
          const meta = departmentMeta[o.tono];
          return (
            <Link key={rel} href={`/departamentos/${o.slug}`} rel={rel} className={`glass glass-interactive flex flex-1 items-center gap-3 overflow-hidden rounded-card p-4 sm:p-5 ${rel === "next" ? "justify-end text-right" : ""}`}>
              {rel === "prev" && <ArrowLeft size={20} aria-hidden="true" />}
              <span>
                <span className="block text-tiny text-ink-2">{txt}</span>
                <span className="flex items-center gap-2 text-body font-semibold"><meta.icon size={16} aria-hidden="true" /> {o.nombre}</span>
              </span>
              {rel === "next" && <ArrowRight size={20} aria-hidden="true" />}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
