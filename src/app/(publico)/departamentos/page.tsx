import type { Metadata } from "next";
import { TarjetasDepartamentos } from "@/components/publico/contenido/Tarjetas";
import { Bloque, PaginaSeccion } from "@/components/publico/plantilla/PaginaSeccion";

export const metadata: Metadata = {
  title: "Departamentos",
  description: "Ventas, Atención al cliente, Marketing, Operaciones · CRM y Dirección: cada departamento con sus agentes de IA. Departamentos y agentes gratis.",
};

export default function Departamentos() {
  return (
    <PaginaSeccion
      ruta="/departamentos"
      antetitulo="Departamentos"
      titular="Cinco departamentos, cada uno con sus agentes"
      subtitulo="Activa los que necesites. Cada agente tiene un trabajo concreto y sabe a quién pasar lo que no le toca."
      video="hero-oficina-cobra-vida"
      secundario={{ href: "/equipo-conectado", label: "Cómo se pasan el trabajo" }}
      provisional
    >
      <Bloque id="todos" titulo="Elige por dónde empezar" intro="Los departamentos y los agentes son gratis: solo pagas por las tareas que hacen.">
        <TarjetasDepartamentos />
      </Bloque>
    </PaginaSeccion>
  );
}
