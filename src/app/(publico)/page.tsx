import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { GlassPanel } from "@/components/glass";
import { CadenaSincronizada } from "@/components/inicio/CadenaSincronizada";
import { CarruselSectores } from "@/components/inicio/CarruselSectores";
import { BorradorDemo, TarjetasControl } from "@/components/inicio/ControlInicio";
import { DepartamentosEnSuSitio } from "@/components/inicio/DepartamentosEnSuSitio";
import { HeroInicio } from "@/components/inicio/HeroInicio";
import { IlustracionCrm, IlustracionNoche, IlustracionWhatsapp } from "@/components/inicio/IlustracionesProblema";
import { EscenaScroll } from "@/components/marketing/EscenaScroll";
import { SeccionFija } from "@/components/marketing/SeccionFija";
import { VideoProducto } from "@/components/marketing/VideoProducto";
import { sobreEscena, tipo } from "@/components/marketing/tipografia";
import { PreguntasFrecuentes } from "@/components/publico/PreguntasFrecuentes";
import { PruebaSocial } from "@/components/publico/PruebaSocial";
import { Bloque } from "@/components/publico/plantilla/PaginaSeccion";
import { Recorrido } from "@/components/publico/plantilla/Recorrido";
import { video } from "@/config/videos";
import { problemaInicio } from "@/content/inicio";
import { pasos, preguntasFrecuentes } from "@/data/publico";
import { fmtNumber } from "@/lib/format";
import { caducidad, euros } from "@/lib/publico/estimacion";
import { packsPublicos } from "@/lib/publico/packs";

const ILUSTRACIONES = { noche: <IlustracionNoche />, whatsapp: <IlustracionWhatsapp />, crm: <IlustracionCrm /> };

function MasInfo({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <p className="mt-6">
      <Link href={href} className={`inline-flex items-center gap-1.5 rounded-pill text-body font-semibold underline-offset-4 hover:underline ${sobreEscena}`}>
        {children} <ArrowRight size={16} aria-hidden="true" />
      </Link>
    </p>
  );
}

/**
 * Portada: una historia que se cuenta al bajar, con la escena pasando del día (arriba) a la noche (abajo).
 * Héroe → problema (sección fija) → respuesta (departamentos) → diferencial (cadena) → control →
 * cómo empezar → sectores → precios → preguntas → cierre de noche.
 */
export default async function Inicio() {
  const packs = await packsPublicos();
  const prueba = packs?.find((p) => p.soloUnaVez);
  const cadena = video("cadena-anuncio-a-venta");
  const configurar = video("configurar-agente");

  return (
    <>
      <EscenaScroll />

      {/* 1 · Héroe */}
      <HeroInicio horizontal={video("hero-oficina-cobra-vida")} vertical={video("hero-oficina-cobra-vida-vertical")} />

      {/* 2 · El problema */}
      <section id="problema" aria-labelledby="problema-t" className="mx-auto w-full max-w-7xl scroll-mt-20 px-4 pt-20">
        <p className={`${tipo.antetitulo} ${sobreEscena}`}>El problema</p>
        <h2 id="problema-t" className={`mt-2 max-w-3xl text-balance ${tipo.titular} ${sobreEscena}`}>Lo que hoy se te escapa</h2>
        <div className="mt-4">
          <SeccionFija
            etiqueta="Tres problemas de cada día"
            pasos={problemaInicio.map((p) => ({ titulo: p.titulo, texto: p.texto, visual: ILUSTRACIONES[p.id] }))}
            vhPorPaso={80}
          />
        </div>
      </section>

      {/* 3 · La respuesta */}
      <Bloque id="respuesta" antetitulo="La respuesta" titulo="Una oficina con cinco departamentos que ya saben trabajar juntos" intro="Cada panel es un departamento con sus agentes. Pulsa uno para ver qué hace.">
        {/* Los paneles llegan desde los lados: se recorta lo que asoma para que no haya scroll horizontal. */}
        <div className="-mx-4 overflow-x-clip px-4 py-2">
          <DepartamentosEnSuSitio />
        </div>
      </Bloque>

      {/* 4 · El diferencial */}
      <Bloque id="cadena" antetitulo="Lo que nos diferencia" titulo="Del anuncio a la venta, sin que nadie se pase la pelota" intro="Los agentes se pasan el trabajo entre departamentos. Tú solo apruebas lo importante.">
        <CadenaSincronizada fuentes={cadena} />
        <MasInfo href="/equipo-conectado">Cómo se conecta el equipo</MasInfo>
      </Bloque>

      {/* 5 · Control */}
      <Bloque id="control" antetitulo="Control" titulo="Tú decides. Los agentes preparan.">
        <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr] lg:items-start">
          <TarjetasControl />
          <BorradorDemo />
        </div>
        <MasInfo href="/seguridad">Cómo protegemos tu empresa</MasInfo>
      </Bloque>

      <PruebaSocial />

      {/* 6 · Cómo empezar */}
      <Bloque id="empezar" antetitulo="Cómo empezar" titulo="En marcha en tres pasos">
        <div className="grid gap-6 lg:grid-cols-[1fr_1.3fr] lg:items-center">
          <ol className="flex flex-col gap-3">
            {pasos.map((p, i) => (
              <li key={p.titulo} className="glass flex gap-4 rounded-card p-5">
                <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent text-small font-semibold">{i + 1}</span>
                <div>
                  <h3 className="text-body font-semibold">{p.titulo}</h3>
                  <p className="mt-1 text-small text-ink-2">{p.texto}</p>
                </div>
              </li>
            ))}
          </ol>
          <div className="relative">
            <VideoProducto poster={configurar.posterWebp} webm={configurar.webm} mp4={configurar.mp4} ancho={configurar.ancho} alto={configurar.alto} descripcion={configurar.descripcion} />
            {configurar.provisional && (
              <span className="absolute top-3 left-3 rounded-pill bg-black/55 px-2.5 py-1 text-tiny text-white/85 ring-1 ring-white/20">Vídeo provisional</span>
            )}
          </div>
        </div>
        <MasInfo href="/como-empezar">Ver los pasos con detalle</MasInfo>
      </Bloque>

      {/* 7 · Sectores */}
      <Bloque id="sectores" antetitulo="Sectores" titulo="Para pymes con leads por varios canales" intro="Ejemplos de lo que hacen los agentes en cada sector.">
        <CarruselSectores />
        <MasInfo href="/sectores">Ver todos los sectores</MasInfo>
      </Bloque>

      {/* 8 · Precios */}
      <section aria-labelledby="precios-t" className="mx-auto w-full max-w-7xl px-4 py-10">
        <GlassPanel className="flex flex-col gap-5 p-6 sm:p-8 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 id="precios-t" className={tipo.subtitular}>Paga solo por lo que hacen tus agentes. Sin cuotas.</h2>
            <p className="mt-2 text-body text-ink-2">
              {prueba
                ? `Empieza con el pack ${prueba.nombre}: ${euros(prueba.precioCentimos)} por ${fmtNumber(prueba.creditos)} créditos para ${caducidad(prueba.diasCaducidad)}, sin IVA.`
                : "Empieza con el pack Prueba."}
            </p>
          </div>
          <Link href="/precios" className="inline-flex shrink-0 items-center gap-2 self-start rounded-pill bg-white px-6 py-3 text-body font-semibold text-black hover:bg-white/90 md:self-auto">
            Ver precios <ArrowRight size={18} aria-hidden="true" />
          </Link>
        </GlassPanel>
      </section>

      {/* 9 · Preguntas frecuentes */}
      <Bloque id="preguntas" antetitulo="Preguntas frecuentes" titulo="Lo que nos suelen preguntar">
        <PreguntasFrecuentes preguntas={preguntasFrecuentes} />
      </Bloque>

      {/* 10 · Cierre de noche, con la oficina encendida */}
      <section aria-labelledby="cierre-t" className="relative flex min-h-svh items-center overflow-hidden px-4 py-24">
        {/* Las luces de la oficina encendidas: focos cálidos sobre la escena de noche (no es cristal). */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 mix-blend-screen">
          <div className="absolute top-[12%] left-[6%] size-80 rounded-full bg-[radial-gradient(circle,rgba(255,212,138,0.55),transparent_65%)]" />
          <div className="absolute top-[28%] right-[4%] size-[28rem] rounded-full bg-[radial-gradient(circle,rgba(255,180,94,0.45),transparent_65%)]" />
          <div className="absolute bottom-[6%] left-[30%] size-[26rem] rounded-full bg-[radial-gradient(circle,rgba(255,212,138,0.35),transparent_65%)]" />
          <div className="absolute bottom-[20%] left-[8%] size-64 rounded-full bg-[radial-gradient(circle,rgba(79,140,255,0.3),transparent_65%)]" />
        </div>
        <div className="relative mx-auto flex max-w-4xl flex-col items-center text-center">
          <p className={`${tipo.antetitulo} ${sobreEscena}`}>Tu oficina, encendida</p>
          <h2 id="cierre-t" className={`mt-4 text-balance ${tipo.display} ${sobreEscena}`}>Pide acceso y te montamos tu primera cadena.</h2>
          <Link href="/solicitar-acceso" className="mt-10 inline-flex items-center gap-3 rounded-pill bg-white px-9 py-5 text-[18px] font-semibold text-black shadow-[0_0_60px_rgba(255,212,138,0.45)] hover:bg-white/90">
            Solicitar acceso <ArrowRight size={22} aria-hidden="true" />
          </Link>
        </div>
      </section>

      <Recorrido ruta="/" />
    </>
  );
}
