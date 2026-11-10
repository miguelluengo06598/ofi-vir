import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ChevronDown, Wrench } from "lucide-react";
import { GlassPanel } from "@/components/glass";
import { departmentMeta } from "@/components/glass/tokens";
import { sobreEscena, tipo } from "@/components/marketing/tipografia";
import { DEPARTAMENTOS } from "@/content/departamentos";
import { scenes } from "@/data/scenes";
import type { SectorPublico } from "@/content/sectores";
import { ConversacionSector } from "./ConversacionSector";

export function PaginaSector({ sector }: { sector: SectorPublico }) {
  const escena = scenes.find((item) => item.id === sector.escena)!;
  const Icono = sector.icono;
  const solicitud = "/solicitar-acceso?sector=" + sector.slug;
  return (
    <>
      <section aria-labelledby="sector-titulo" className="relative -mt-20 flex min-h-svh items-end overflow-hidden">
        <Image src={escena.src} alt="" fill priority sizes="100vw" className="object-cover" />
        <div aria-hidden="true" className="absolute inset-0 bg-linear-to-t from-black/85 via-black/45 to-black/30" />
        <div aria-hidden="true" className="absolute inset-0" style={{ background: "radial-gradient(75% 70% at 82% 22%, " + sector.acento + "73, transparent 72%)" }} />
        <div className="relative mx-auto w-full max-w-7xl px-4 pt-32 pb-20 sm:pb-24">
          <div className={"max-w-3xl " + sobreEscena}>
            <p className="inline-flex items-center gap-2 rounded-pill bg-black/35 py-1 pr-3 pl-1 ring-1 ring-white/20">
              <span className="flex size-7 items-center justify-center rounded-full" style={{ background: sector.acento }}><Icono size={15} aria-hidden="true" /></span>
              <span className={tipo.antetitulo + " text-white"}>Sector · {sector.nombre}</span>
            </p>
            <h1 id="sector-titulo" className={"mt-5 text-balance " + tipo.display}>{sector.titular}</h1>
            <p className={"mt-6 max-w-2xl " + tipo.entradilla + " text-white/85"}>{sector.problema.texto}</p>
            <blockquote className="mt-7 max-w-2xl border-l-2 py-1 pl-4 text-[clamp(1.06rem,0.98rem+0.4vw,1.31rem)] leading-relaxed text-white" style={{ borderColor: sector.acento }}>“{sector.ejemplo}”</blockquote>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href={solicitud} className="inline-flex items-center justify-center gap-2 rounded-pill bg-white px-6 py-3 text-body font-semibold text-black [text-shadow:none] hover:bg-white/90">Solicitar acceso para {sector.nombre.toLowerCase()} <ArrowRight size={18} aria-hidden="true" /></Link>
              <a href="#conversacion" className="inline-flex items-center justify-center rounded-pill bg-white/10 px-6 py-3 text-body ring-1 ring-white/25 hover:bg-white/15">Ver conversación</a>
            </div>
          </div>
        </div>
        <a href="#problema" aria-label="Seguir bajando" className="absolute bottom-6 left-1/2 hidden -translate-x-1/2 rounded-full p-2 text-white/70 hover:text-white sm:block"><ChevronDown size={26} aria-hidden="true" className="motion-safe:animate-bounce" /></a>
      </section>

      <section id="problema" aria-labelledby="problema-titulo" className="mx-auto grid w-full max-w-7xl gap-4 px-4 py-16 sm:py-24 md:grid-cols-2">
        <GlassPanel className="rounded-card! p-6 sm:p-8"><p className={tipo.antetitulo}>El problema típico</p><h2 id="problema-titulo" className={"mt-3 text-balance " + tipo.subtitular}>{sector.problema.titulo}</h2><p className="mt-4 text-body leading-relaxed text-ink-2">{sector.problema.texto}</p></GlassPanel>
        <GlassPanel className="rounded-card! p-6 sm:p-8"><p className={tipo.antetitulo}>Cómo lo resuelve la oficina</p><h2 className={"mt-3 text-balance " + tipo.subtitular}>{sector.resuelve.titulo}</h2><p className="mt-4 text-body leading-relaxed text-ink-2">{sector.resuelve.texto}</p></GlassPanel>
      </section>

      <section id="conversacion" aria-labelledby="conversacion-titulo" className="mx-auto grid w-full max-w-7xl gap-10 px-4 py-16 sm:py-24 lg:grid-cols-[0.8fr_1.2fr] lg:items-center">
        <div className={sobreEscena}><p className={tipo.antetitulo}>Ejemplo ficticio</p><h2 id="conversacion-titulo" className={"mt-3 text-balance " + tipo.titular}>Así podría sonar una conversación habitual</h2><p className={"mt-5 " + tipo.entradilla}>Se escribe al entrar en pantalla. Es una demostración: no envía mensajes ni representa una conversación real.</p></div>
        <ConversacionSector conversacion={sector.conversacion} />
      </section>

      <section id="equipo" aria-labelledby="equipo-titulo" className="mx-auto w-full max-w-7xl px-4 py-16 sm:py-20">
        <div className={"mb-8 max-w-2xl " + sobreEscena}><p className={tipo.antetitulo}>Recomendación de partida</p><h2 id="equipo-titulo" className={"mt-3 text-balance " + tipo.titular}>Departamentos y agentes que encajan</h2></div>
        <ul className="grid gap-4 md:grid-cols-3">
          {sector.recomendados.map((recomendacion) => {
            const departamento = DEPARTAMENTOS.find((item) => item.slug === recomendacion.departamento)!;
            const meta = departmentMeta[departamento.tono];
            const DepartamentoIcono = meta.icon;
            return <li key={recomendacion.departamento}><Link href={"/departamentos/" + departamento.slug} className="glass glass-interactive block h-full overflow-hidden rounded-card text-white"><span className={"flex items-center gap-2 px-4 py-3 text-small font-semibold " + meta.header}><DepartamentoIcono size={16} aria-hidden="true" />{departamento.nombre}</span><span className="block p-5">{recomendacion.agentes.map((agente) => <span key={agente.nombre} className="mb-3 block last:mb-0"><span className="block text-body font-semibold">{agente.nombre}</span><span className="block text-small text-ink-2">{agente.rol}</span></span>)}</span></Link></li>;
          })}
        </ul>
      </section>

      <section aria-labelledby="herramientas-titulo" className="mx-auto w-full max-w-7xl px-4 py-16 sm:py-20">
        <div className={"mb-8 max-w-2xl " + sobreEscena}><p className={tipo.antetitulo}>Herramientas habituales</p><h2 id="herramientas-titulo" className={"mt-3 text-balance " + tipo.subtitular}>Conecta solo lo que este flujo necesita</h2></div>
        <ul className="grid gap-4 md:grid-cols-3">{sector.herramientas.map((herramienta) => <li key={herramienta.nombre}><GlassPanel className="h-full rounded-card! p-5"><Wrench size={19} aria-hidden="true" className="text-accent" /><h3 className="mt-4 text-body font-semibold">{herramienta.nombre}</h3><p className="mt-2 text-small leading-relaxed text-ink-2">{herramienta.para}</p></GlassPanel></li>)}</ul>
      </section>

      <section aria-labelledby="final-titulo" className="mx-auto flex min-h-[62svh] w-full max-w-4xl flex-col items-center justify-center px-4 py-20 text-center">
        <p className={tipo.antetitulo + " " + sobreEscena}>Tu caso, con tus reglas</p><h2 id="final-titulo" className={"mt-3 text-balance " + tipo.titular + " " + sobreEscena}>Empezamos por el flujo que más tiempo te quita</h2><p className={"mt-5 max-w-xl " + tipo.entradilla + " " + sobreEscena}>Seleccionaremos {sector.nombre.toLowerCase()} en tu solicitud para preparar la conversación desde ese punto de partida.</p><Link href={solicitud} className="mt-8 inline-flex items-center gap-2 rounded-pill bg-white px-7 py-3.5 text-body font-semibold text-black hover:bg-white/90">Solicitar acceso <ArrowRight size={18} aria-hidden="true" /></Link>
      </section>
    </>
  );
}
