"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, Pause, Play } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { GlassPanel } from "@/components/glass";
import { RevelarTexto } from "@/components/marketing/RevelarTexto";
import { usePreferencias } from "@/components/marketing/preferencias";
import { tipo } from "@/components/marketing/tipografia";
import type { FuentesDeVideo } from "@/config/videos";
import { heroInicio } from "@/content/inicio";

const VERTICAL = "(max-aspect-ratio: 1/1)";
const suscribir = (cambio: () => void) => {
  const mq = window.matchMedia(VERTICAL);
  mq.addEventListener("change", cambio);
  return () => mq.removeEventListener("change", cambio);
};
/** null hasta hidratar: así el vídeo solo se pide en el cliente y con la orientación correcta. */
const useVertical = () => useSyncExternalStore<boolean | null>(suscribir, () => window.matchMedia(VERTICAL).matches, () => null);

/**
 * Héroe de la portada: el vídeo hero de fondo (vertical en pantallas verticales) bajo el panel de cristal.
 * El póster va en el HTML (es la imagen principal de la página); el vídeo se pide al hidratar, salvo con
 * movimiento reducido o ahorro de datos, que se quedan en el póster con botón «Reproducir».
 */
export function HeroInicio({ horizontal, vertical }: { horizontal: FuentesDeVideo; vertical: FuentesDeVideo }) {
  const esVertical = useVertical();
  const { reducido, ahorro } = usePreferencias();
  const [pausado, setPausado] = useState(false);
  const [pedido, setPedido] = useState(false);
  const [listo, setListo] = useState(false);
  const ref = useRef<HTMLVideoElement>(null);
  const fuentes = esVertical ? vertical : horizontal;
  const automatico = !reducido && !ahorro;
  const conVideo = esVertical !== null && (automatico || pedido);

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    if (pausado) v.pause();
    else v.play().catch(() => setPausado(true));
  }, [pausado, conVideo, esVertical]);

  return (
    <section aria-labelledby="hero-titulo" className="relative -mt-20 flex min-h-svh items-center overflow-hidden pt-24 pb-24">
      {/* Fondo: póster (en el HTML) y vídeo encima cuando está listo. */}
      <div aria-hidden="true" className="absolute inset-0 -z-[1] bg-black">
        <picture>
          <source media={VERTICAL} srcSet={vertical.posterAvif} type="image/avif" />
          <source media={VERTICAL} srcSet={vertical.posterWebp} type="image/webp" />
          <source srcSet={horizontal.posterAvif} type="image/avif" />
          <img src={horizontal.posterWebp} alt="" fetchPriority="high" decoding="async" className="absolute inset-0 size-full object-cover" />
        </picture>
        {conVideo && (
          <video
            key={fuentes.id}
            ref={ref}
            muted
            loop
            playsInline
            autoPlay
            preload="metadata"
            onPlaying={() => setListo(true)}
            className={`absolute inset-0 size-full object-cover transition-opacity duration-700 ${listo ? "opacity-100" : "opacity-0"}`}
          >
            <source src={fuentes.webm} type="video/webm" />
            <source src={fuentes.mp4} type="video/mp4" />
          </video>
        )}
        <div className="absolute inset-0 bg-linear-to-b from-black/60 via-black/40 to-black/75" />
      </div>

      <div className="mx-auto w-full max-w-7xl px-4">
        <GlassPanel className="max-w-3xl p-6 sm:p-9 [--glass-fill:rgba(255,255,255,0.08)]">
          <RevelarTexto as="h1" texto={heroInicio.titular} className={`text-balance ${tipo.display} text-[clamp(2.25rem,1rem+3.4vw,4.25rem)]!`} escalon={0.05} />
          <p className={`mt-6 max-w-2xl ${tipo.entradilla}`}>{heroInicio.subtitulo}</p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link href="/solicitar-acceso" className="inline-flex items-center justify-center gap-2 rounded-pill bg-white px-6 py-3.5 text-body font-semibold text-black hover:bg-white/90">
              Solicitar acceso <ArrowRight size={18} aria-hidden="true" />
            </Link>
            <Link href="/producto" className="inline-flex items-center justify-center rounded-pill bg-white/10 px-6 py-3.5 text-body ring-1 ring-white/25 hover:bg-white/15">
              Ver la oficina por dentro
            </Link>
          </div>
        </GlassPanel>
      </div>

      <div className="absolute bottom-6 left-4 sm:left-6">
        {conVideo ? (
          <button
            type="button"
            onClick={() => setPausado((p) => !p)}
            aria-label={pausado ? "Reproducir el vídeo de fondo" : "Pausar el vídeo de fondo"}
            className="flex size-11 items-center justify-center rounded-full bg-black/50 ring-1 ring-white/30 hover:bg-black/70"
          >
            {pausado ? <Play size={17} aria-hidden="true" /> : <Pause size={17} aria-hidden="true" />}
          </button>
        ) : (
          esVertical !== null && (
            <button type="button" onClick={() => setPedido(true)} className="inline-flex items-center gap-2 rounded-pill bg-black/55 px-4 py-2.5 text-small ring-1 ring-white/30">
              <Play size={15} aria-hidden="true" /> Reproducir vídeo
            </button>
          )
        )}
      </div>

      <IndicadorScroll reducido={reducido} />
      <p className="sr-only">{horizontal.descripcion}</p>
    </section>
  );
}

function IndicadorScroll({ reducido }: { reducido: boolean }) {
  return (
    <a href="#problema" className="absolute bottom-6 left-1/2 flex -translate-x-1/2 flex-col items-center gap-2 rounded-pill px-3 py-1 text-tiny text-ink-2 hover:text-white">
      <span aria-hidden="true" className="flex h-9 w-6 justify-center rounded-full ring-2 ring-white/60">
        <motion.span
          className="mt-2 block size-1.5 rounded-full bg-white"
          animate={reducido ? undefined : { y: [0, 12, 0], opacity: [1, 0.2, 1] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
        />
      </span>
      Baja para ver la historia
    </a>
  );
}
