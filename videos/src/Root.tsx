import type { ComponentType } from "react";
import { Composition } from "remotion";
import { CATALOGO, DIMENSIONES, FPS } from "./catalogo";
import { HeroOficina } from "./composiciones/HeroOficina";

/** Componente de cada vídeo del catálogo (las versiones verticales usan el mismo con otra distribución). */
const COMPONENTES: Record<string, ComponentType> = {
  "hero-oficina-cobra-vida": HeroOficina,
  "hero-oficina-cobra-vida-vertical": HeroOficina,
};

export const RemotionRoot = () => {
  return (
    <>
      {CATALOGO.filter((v) => !v.pendiente && COMPONENTES[v.id]).map((v) => (
        <Composition
          key={v.id}
          id={v.id}
          component={COMPONENTES[v.id]}
          durationInFrames={v.segundos * FPS}
          fps={FPS}
          width={DIMENSIONES[v.formato].ancho}
          height={DIMENSIONES[v.formato].alto}
        />
      ))}
    </>
  );
};
