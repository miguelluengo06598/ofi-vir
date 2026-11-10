import Link from "next/link";
import { ArrowRight, ChevronDown } from "lucide-react";
import { ViewTransition } from "react";
import { Avatar } from "@/components/glass";
import { departmentMeta } from "@/components/glass/tokens";
import { VideoProducto } from "@/components/marketing/VideoProducto";
import { LUZ, sobreEscena, tipo } from "@/components/marketing/tipografia";
import { video as fuentesDe } from "@/config/videos";
import type { DepartamentoPublico, FichaDepartamento } from "@/content/departamentos";

/**
 * Héroe a pantalla completa: el vídeo del departamento ocupa toda la escena y su color de acento tiñe la luz
 * (un halo del color del departamento arriba y la luz cálida de los traspasos abajo, que respiran despacio).
 * Sin cristal sobre el vídeo: el texto va directamente sobre la escena, con su sombra.
 * El bloque del título se llama `departamento-<slug>`: el panel del índice se transforma en él al entrar.
 */
export function HeroDepartamento({ d, ficha }: { d: DepartamentoPublico; ficha: FichaDepartamento }) {
  const f = fuentesDe(d.video);
  const Icono = departmentMeta[d.tono].icon;
  return (
    // -mt-20: el héroe sube bajo la cabecera fija para ocupar la pantalla entera.
    <section aria-labelledby="dep-titulo" className="relative -mt-20 flex min-h-svh items-end overflow-hidden">
      <VideoProducto cubrir poster={f.posterWebp} webm={f.webm} mp4={f.mp4} ancho={f.ancho} alto={f.alto} descripcion={f.descripcion} sizes="100vw">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0">
          {/* Luz del departamento */}
          <div
            className="absolute inset-0 mix-blend-screen motion-safe:animate-[respirar_9s_ease-in-out_infinite]"
            style={{ background: `radial-gradient(70% 60% at 78% 18%, ${ficha.acento}8c 0%, ${ficha.acento}26 45%, transparent 75%)` }}
          />
          <div
            className="absolute inset-0 mix-blend-screen opacity-60"
            style={{ background: `radial-gradient(40% 35% at 15% 105%, ${LUZ}55 0%, transparent 70%)` }}
          />
          {/* Velo para leer el texto */}
          <div className="absolute inset-0 bg-linear-to-t from-black/80 via-black/35 to-black/30" />
          <div className="absolute inset-0 bg-linear-to-r from-black/45 to-transparent" />
        </div>
        {f.provisional && (
          <span className="absolute top-24 right-4 z-10 rounded-pill bg-black/55 px-2.5 py-1 text-tiny text-white/85 ring-1 ring-white/20">
            Vídeo provisional
          </span>
        )}
      </VideoProducto>

      <div className="pointer-events-none relative mx-auto w-full max-w-7xl px-4 pt-32 pb-20 sm:pb-24">
        <ViewTransition name={`departamento-${d.slug}`} share="morph" default="none">
          <div className={`pointer-events-auto max-w-3xl ${sobreEscena}`}>
            <p className="inline-flex items-center gap-2 rounded-pill bg-black/30 py-1 pr-3 pl-1 ring-1 ring-white/20">
              <span className="flex size-7 items-center justify-center rounded-full" style={{ background: ficha.acento }}>
                <Icono size={15} aria-hidden="true" />
              </span>
              <span className={tipo.antetitulo + " text-white"}>Departamento · {d.nombre}</span>
            </p>
            <h1 id="dep-titulo" className={`mt-5 text-balance ${tipo.display}`}>{d.titular}</h1>
            <p className={`mt-6 max-w-2xl ${tipo.entradilla} text-white/85`}>{d.subtitulo}</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Link href="/solicitar-acceso" className="inline-flex items-center justify-center gap-2 rounded-pill bg-white px-6 py-3 text-body font-semibold text-black [text-shadow:none] hover:bg-white/90">
                Solicitar acceso <ArrowRight size={18} aria-hidden="true" />
              </Link>
              <a href="#equipo" className="inline-flex items-center gap-3 rounded-pill bg-white/10 py-2 pr-5 pl-2 text-body ring-1 ring-white/25 hover:bg-white/15">
                <span className="flex -space-x-2" aria-hidden="true">
                  {ficha.agentes.map((a) => (
                    <Avatar key={a.nombre} name={a.nombre} tone={d.tono} size={32} className="ring-2 ring-black/30" />
                  ))}
                </span>
                Conoce a tu equipo
              </a>
            </div>
          </div>
        </ViewTransition>
      </div>

      <a href="#problema" aria-label="Seguir bajando" className="absolute bottom-6 left-1/2 hidden -translate-x-1/2 rounded-full p-2 text-white/70 hover:text-white sm:block">
        <ChevronDown size={26} aria-hidden="true" className="motion-safe:animate-bounce" />
      </a>
    </section>
  );
}
