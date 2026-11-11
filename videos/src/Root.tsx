import type { ComponentType } from "react";
import { Composition } from "remotion";
import { CATALOGO, DIMENSIONES, FPS } from "./catalogo";
import { Aprobaciones } from "./composiciones/Aprobaciones";
import { Cadena } from "./composiciones/Cadena";
import { Certificacion } from "./composiciones/Certificacion";
import { ConfigurarAgente } from "./composiciones/ConfigurarAgente";
import { Creditos } from "./composiciones/Creditos";
import { crearDepartamento } from "./composiciones/Departamento";
import { HeroOficina } from "./composiciones/HeroOficina";
import { Memoria } from "./composiciones/Memoria";

/** Componente de cada vídeo del catálogo (las versiones verticales usan el mismo con otra distribución). */
const COMPONENTES: Record<string, ComponentType> = {
  "hero-oficina-cobra-vida": HeroOficina,
  "hero-oficina-cobra-vida-vertical": HeroOficina,
  "departamento-ventas": crearDepartamento("ventas"),
  "departamento-atencion-al-cliente": crearDepartamento("atencion"),
  "departamento-marketing": crearDepartamento("marketing"),
  "departamento-operaciones-crm": crearDepartamento("operaciones"),
  "departamento-direccion": crearDepartamento("direccion"),
  "cadena-anuncio-a-venta": Cadena,
  aprobaciones: Aprobaciones,
  memoria: Memoria,
  creditos: Creditos,
  "configurar-agente": ConfigurarAgente,
  certificacion: Certificacion,
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
