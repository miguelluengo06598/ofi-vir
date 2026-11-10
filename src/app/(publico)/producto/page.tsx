import type { Metadata } from "next";
import Link from "next/link";
import { DemoProducto, RecorridoProducto } from "@/components/producto/RecorridoProducto";
import { Bloque, PaginaSeccion } from "@/components/publico/plantilla/PaginaSeccion";

export const metadata: Metadata = {
  title: "La oficina por dentro",
  description: "Todo tu equipo de IA en una sola pantalla: departamentos, mensajes, aprobaciones, memoria, traspasos en directo y créditos.",
};

export default function Producto() {
  return (
    <PaginaSeccion
      ruta="/producto"
      antetitulo="La oficina por dentro"
      titular="Todo tu equipo de IA en una sola pantalla"
      subtitulo="Departamentos, agentes, mensajes, aprobaciones, memoria y créditos. Lo ves todo y decides lo importante."
      video="hero-oficina-cobra-vida"
      secundario={{ href: "/departamentos", label: "Ver departamentos" }}
      final={{ titular: "Pide acceso y te enseñamos tu oficina", texto: "La montamos con tus departamentos y tus herramientas, y la pruebas antes de activarla." }}
    >
      <Bloque id="recorrido" antetitulo="Recorrido" titulo="Así es la oficina" intro="Baja despacio: cada paso enseña una parte de la interfaz real, con datos de ejemplo.">
        <RecorridoProducto />
      </Bloque>

      <Bloque id="pruebala" antetitulo="Pruébala" titulo="Pulsa un departamento y mira quién trabaja en él" intro="Es la oficina de verdad con datos de ejemplo. Nada de lo que hagas aquí sale a ningún sitio.">
        <div className="pt-8">
          <DemoProducto />
        </div>
        <p className="mt-6">
          <Link href="/departamentos" className="text-body font-semibold underline underline-offset-4">Ver todos los departamentos</Link>
        </p>
      </Bloque>
    </PaginaSeccion>
  );
}
