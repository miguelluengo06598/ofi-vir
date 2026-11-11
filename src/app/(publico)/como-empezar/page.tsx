import type { Metadata } from "next";
import { DemoAsistenteNegocio, LoQueHacemos, PasosComoEmpezar } from "@/components/publico/ComoEmpezar";
import { Bloque, PaginaSeccion } from "@/components/publico/plantilla/PaginaSeccion";

export const metadata: Metadata = {
  title: "Cómo empezar",
  description: "Tu primer agente, funcionando en días, no en meses. Lo configuramos contigo, lo pruebas y MyOfia lo certifica antes de activarlo.",
};

export default function ComoEmpezar() {
  return (
    <PaginaSeccion
      ruta="/como-empezar"
      antetitulo="Cómo empezar"
      titular="Tu primer agente, funcionando en días, no en meses"
      subtitulo="Nos cuentas tu negocio, montamos la oficina contigo y revisas cada paso antes de que el agente toque algo real."
      video="configurar-agente"
      secundario={{ href: "/precios", label: "Ver precios" }}
      final={{ titular: "¿Listo para tener tu primer agente?", texto: "Solicita acceso. Vemos tu caso, montamos la oficina y lo ponemos a prueba contigo." }}
    >
      <PasosComoEmpezar />

      <Bloque id="asistente" antetitulo="Una demo, sin IA" titulo="Cuéntanos tu negocio, con tus palabras" intro="Elige un ejemplo y mira cómo el asistente convierte una explicación normal en una ficha que puedes revisar.">
        <DemoAsistenteNegocio />
      </Bloque>

      <Bloque id="implantacion" antetitulo="Nos ocupamos contigo" titulo="Lo que hacemos nosotros" intro="No te dejamos a solas con un constructor de agentes. Implantamos la oficina y la ajustamos a cómo ya trabajas.">
        <LoQueHacemos />
      </Bloque>
    </PaginaSeccion>
  );
}
