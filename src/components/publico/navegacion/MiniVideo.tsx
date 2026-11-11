"use client";

import { usePreferencias } from "@/components/marketing/preferencias";
import type { FuentesDeVideo } from "@/config/videos";

/**
 * Miniatura de un vídeo para el mega menú: póster fijo y, solo mientras `activo` (ratón o foco encima),
 * el vídeo en bucle. Sin movimiento reducido ni ahorro de datos; nunca se descarga si no se pide.
 * Hueco reservado con aspect-ratio. Es decorativa: el texto de la tarjeta ya dice qué es.
 */
export function MiniVideo({ fuentes, activo }: { fuentes: FuentesDeVideo; activo: boolean }) {
  const { reducido, ahorro } = usePreferencias();
  const reproducir = activo && !reducido && !ahorro;
  return (
    <span aria-hidden="true" className="relative block overflow-hidden rounded-[14px] bg-black/40" style={{ aspectRatio: `${fuentes.ancho} / ${fuentes.alto}` }}>
      <picture>
        <source srcSet={fuentes.posterAvif} type="image/avif" />
        <img src={fuentes.posterWebp} alt="" loading="lazy" decoding="async" className="absolute inset-0 size-full object-cover" />
      </picture>
      {reproducir && (
        <video autoPlay muted loop playsInline preload="auto" className="absolute inset-0 size-full object-cover">
          <source src={fuentes.mp4} type="video/mp4" />
          <source src={fuentes.webm} type="video/webm" />
        </video>
      )}
    </span>
  );
}
