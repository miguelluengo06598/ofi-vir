import type { Metadata } from "next";
import { TarjetasSectores } from "@/components/publico/sectores/TarjetasSectores";
import { Bloque, PaginaSeccion } from "@/components/publico/plantilla/PaginaSeccion";

export const metadata: Metadata = {
  title: "Sectores",
  description: "Ejemplos de uso para clínicas, academias, inmobiliarias, gimnasios, e-commerce y reformas.",
};

export default function Sectores() {
  return (
    <PaginaSeccion
      ruta="/sectores"
      antetitulo="Sectores"
      titular="Para pymes con leads por varios canales"
      subtitulo="Seis ejemplos de cómo una oficina de agentes puede ordenar el primer contacto, el seguimiento y lo que necesita tu aprobación."
      video="hero-oficina-cobra-vida"
      secundario={{ href: "/precios", label: "Ver precios" }}
    >
      <Bloque id="todos" antetitulo="Ejemplos de uso" titulo="Elige tu sector" intro="Son escenas ficticias: no representan clientes, empresas reales ni resultados prometidos.">
        <TarjetasSectores />
      </Bloque>
    </PaginaSeccion>
  );
}
