"use client";

import Image from "next/image";
import { useInView } from "framer-motion";
import { Pause, Play } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { usePreferencias } from "./preferencias";

type Props = {
  /** Imagen fija que se ve mientras carga, al salir de pantalla y con movimiento reducido o ahorro de datos. */
  poster: string;
  webm?: string;
  mp4: string;
  /** Proporción del vídeo (ancho / alto): reserva el hueco desde el principio. */
  ancho: number;
  alto: number;
  /** Qué se ve en el vídeo (texto alternativo). */
  descripcion: string;
  sizes?: string;
  className?: string;
  /** Avisa del segundo actual mientras se reproduce (para sincronizar texto con el vídeo). */
  alTiempo?: (segundo: number, duracion: number) => void;
  /** Llena su contenedor (posicionado) en vez de reservar su proporción: para vídeos de fondo a pantalla completa. */
  cubrir?: boolean;
  /** Capas sobre el vídeo (velos, luz de la escena): quedan por debajo de los botones. */
  children?: ReactNode;
};

/**
 * Vídeo de producto en bucle, silenciado y en línea. No descarga nada hasta acercarse a la pantalla, se
 * reproduce solo mientras se ve y se pausa al salir. Con movimiento reducido o ahorro de datos se queda
 * en el póster con un botón «Reproducir vídeo». Siempre hay botón de pausa (más de 5 s de movimiento).
 */
export function VideoProducto({ poster, webm, mp4, ancho, alto, descripcion, sizes = "(min-width: 1024px) 60vw, 100vw", className = "", alTiempo, cubrir, children }: Props) {
  const caja = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  // Una vez cargado se queda montado: al volver no se descarga de nuevo, solo se reanuda.
  const cerca = useInView(caja, { margin: "300px 0px", once: true });
  const visible = useInView(caja, { amount: 0.25 });
  const { reducido, ahorro } = usePreferencias();
  const automatico = !reducido && !ahorro;

  const [pedido, setPedido] = useState(false); // La persona pulsó «Reproducir».
  const [pausado, setPausado] = useState(false); // La persona pulsó «Pausar».
  const [listo, setListo] = useState(false); // Ya hay imagen de vídeo: se puede ocultar el póster.

  const cargar = (automatico && cerca) || pedido;
  const reproducir = cargar && visible && !pausado;

  useEffect(() => {
    const v = video.current;
    if (!v) return;
    // Safari iOS solo reproduce solo si el atributo `muted` está (React fija la propiedad, no el atributo).
    v.defaultMuted = true;
    v.muted = true;
    if (v.readyState >= 2) setListo(true);
    if (reproducir) v.play().catch(() => setPausado(true));
    else v.pause();
  }, [reproducir, cargar]);

  const mostrarBotonGrande = !automatico && !pedido;

  return (
    <figure
      className={`${cubrir ? "absolute inset-0" : "relative rounded-card"} overflow-hidden bg-black/40 ${className}`}
      style={cubrir ? undefined : { aspectRatio: `${ancho} / ${alto}` }}
      ref={caja}
    >
      <Image src={poster} alt={mostrarBotonGrande || !listo ? descripcion : ""} fill sizes={sizes} className="object-cover" />
      {cargar && (
        <video
          ref={video}
          muted
          loop
          playsInline
          preload="metadata"
          aria-label={descripcion}
          onPlaying={() => setListo(true)}
          onLoadedData={() => setListo(true)}
          onTimeUpdate={(e) => {
            if (!listo) setListo(true);
            alTiempo?.(e.currentTarget.currentTime, e.currentTarget.duration || 0);
          }}
          className={`absolute inset-0 size-full object-cover transition-opacity duration-500 ${listo ? "opacity-100" : "opacity-0"}`}
        >
          {/* MP4 (H.264) primero: lo reproduce cualquier navegador; Safari a veces dice que puede con WebM y no puede. */}
          <source src={mp4} type="video/mp4" />
          {webm && <source src={webm} type="video/webm" />}
        </video>
      )}
      {children}

      {mostrarBotonGrande ? (
        <button
          type="button"
          onClick={() => setPedido(true)}
          className="absolute inset-0 m-auto flex h-14 w-fit items-center gap-2 rounded-pill bg-white px-6 text-body font-semibold text-black shadow-lg"
        >
          <Play size={18} aria-hidden="true" /> Reproducir vídeo
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setPausado((p) => !p)}
          aria-label={pausado ? "Reproducir vídeo" : "Pausar vídeo"}
          className="absolute right-3 bottom-3 flex size-10 items-center justify-center rounded-full bg-black/55 text-white ring-1 ring-white/30 hover:bg-black/70"
        >
          {pausado ? <Play size={16} aria-hidden="true" /> : <Pause size={16} aria-hidden="true" />}
        </button>
      )}
      <figcaption className="sr-only">{descripcion}</figcaption>
    </figure>
  );
}
