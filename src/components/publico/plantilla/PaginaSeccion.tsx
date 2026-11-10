import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { ViewTransition, type ReactNode } from "react";
import { GlassPanel } from "@/components/glass";
import { VideoProducto } from "@/components/marketing/VideoProducto";
import { sobreEscena, tipo } from "@/components/marketing/tipografia";
import { video as fuentesDe, type VideoId } from "@/config/videos";
import { Recorrido } from "./Recorrido";

type Boton = { href: string; label: string };

type Props = {
  /** Ruta de la página: decide el anterior y el siguiente del recorrido. */
  ruta: string;
  antetitulo: string;
  titular: string;
  subtitulo: string;
  video?: VideoId;
  principal?: Boton;
  secundario?: Boton;
  /** Marca visible mientras el texto no sea definitivo. */
  provisional?: boolean;
  /** Ideas grandes bajo los botones del héroe (p. ej. «Sin cuotas»). */
  destacados?: readonly { titulo: string; texto: string }[];
  /** Secciones intermedias. */
  children?: ReactNode;
  final?: { titular: string; texto: string };
};

/**
 * Plantilla de página de sección: héroe a pantalla completa (panel de cristal con titular, subtítulo,
 * vídeo y botones), secciones intermedias, llamada final a solicitar acceso y recorrido anterior/siguiente.
 * El panel del héroe se llama «panel-principal»: al navegar entre páginas con plantilla, se transforma de
 * una a otra (View Transitions). La escena de fondo queda fuera de la transición y no parpadea.
 */
export function PaginaSeccion({
  ruta,
  antetitulo,
  titular,
  subtitulo,
  video,
  principal = { href: "/solicitar-acceso", label: "Solicitar acceso" },
  secundario,
  provisional,
  destacados,
  children,
  final = { titular: "Pide acceso y te montamos tu primera cadena", texto: "Nos cuentas cómo te llegan los clientes y lo dejamos funcionando contigo." },
}: Props) {
  const fuentes = video ? fuentesDe(video) : null;
  return (
    <>
      <section aria-labelledby="pagina-titulo" className="mx-auto flex min-h-[calc(100svh-6rem)] w-full max-w-7xl items-center px-4 pt-6 pb-10">
        <ViewTransition name="panel-principal" share="morph" default="none">
          <GlassPanel className="grid w-full items-center gap-8 p-6 sm:p-10 lg:grid-cols-[1.05fr_1fr] lg:gap-12">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className={tipo.antetitulo}>{antetitulo}</p>
                {provisional && (
                  <span className="rounded-pill bg-status-waiting/20 px-2 py-0.5 text-tiny text-status-waiting ring-1 ring-status-waiting/40">Contenido provisional</span>
                )}
              </div>
              <h1 id="pagina-titulo" className={`mt-3 text-balance ${tipo.titular}`}>{titular}</h1>
              <p className={`mt-5 max-w-xl ${tipo.entradilla}`}>{subtitulo}</p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link href={principal.href} className="inline-flex items-center justify-center gap-2 rounded-pill bg-white px-6 py-3 text-body font-semibold text-black hover:bg-white/90">
                  {principal.label} <ArrowRight size={18} aria-hidden="true" />
                </Link>
                {secundario && (
                  <Link href={secundario.href} className="inline-flex items-center justify-center rounded-pill bg-white/10 px-6 py-3 text-body ring-1 ring-white/25 hover:bg-white/15">
                    {secundario.label}
                  </Link>
                )}
              </div>
              {destacados && (
                <ul className="mt-8 grid gap-3 sm:grid-cols-3">
                  {destacados.map((d) => (
                    <li key={d.titulo} className="rounded-card bg-black/25 p-4 ring-1 ring-white/10">
                      <p className="text-h2 leading-tight">{d.titulo}</p>
                      <p className="mt-1.5 text-tiny text-ink-2">{d.texto}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {fuentes && (
              <div className="relative">
                <VideoProducto poster={fuentes.posterWebp} webm={fuentes.webm} mp4={fuentes.mp4} ancho={fuentes.ancho} alto={fuentes.alto} descripcion={fuentes.descripcion} />
                {fuentes.provisional && (
                  <span className="absolute top-3 left-3 rounded-pill bg-black/55 px-2.5 py-1 text-tiny text-white/85 ring-1 ring-white/20">Vídeo provisional</span>
                )}
              </div>
            )}
          </GlassPanel>
        </ViewTransition>
      </section>

      {children}

      <section aria-labelledby="final-titulo" className="mx-auto w-full max-w-7xl px-4 pt-10 pb-6">
        <GlassPanel strong className="flex flex-col items-center gap-5 p-8 text-center sm:p-12">
          <h2 id="final-titulo" className={`max-w-2xl text-balance ${tipo.subtitular}`}>{final.titular}</h2>
          <p className={`max-w-xl ${tipo.entradilla}`}>{final.texto}</p>
          <Link href="/solicitar-acceso" className="inline-flex items-center gap-2 rounded-pill bg-white px-6 py-3 text-body font-semibold text-black hover:bg-white/90">
            Solicitar acceso <ArrowRight size={18} aria-hidden="true" />
          </Link>
        </GlassPanel>
      </section>

      <Recorrido ruta={ruta} />
    </>
  );
}

/** Sección intermedia de la plantilla. */
export function Bloque({ id, antetitulo, titulo, intro, children }: { id: string; antetitulo?: string; titulo: string; intro?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-t`} className="mx-auto w-full max-w-7xl scroll-mt-24 px-4 py-14 sm:py-20">
      <div className="mb-8 max-w-2xl">
        {antetitulo && <p className={`${tipo.antetitulo} ${sobreEscena}`}>{antetitulo}</p>}
        <h2 id={`${id}-t`} className={`mt-2 text-balance ${tipo.subtitular} ${sobreEscena}`}>{titulo}</h2>
        {intro && <div className={`mt-3 ${tipo.entradilla} ${sobreEscena}`}>{intro}</div>}
      </div>
      {children}
    </section>
  );
}
