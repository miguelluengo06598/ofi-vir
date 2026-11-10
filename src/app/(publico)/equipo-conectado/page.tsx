import type { Metadata } from "next";
import { CadenaDemo } from "@/components/publico/CadenaDemo";
import { Provisionales } from "@/components/publico/contenido/Tarjetas";
import { Bloque, PaginaSeccion } from "@/components/publico/plantilla/PaginaSeccion";
import { CONSUMOS_FIJOS } from "@/lib/creditos/tarifas";

export const metadata: Metadata = {
  title: "Equipo conectado",
  description: "Los agentes de distintos departamentos se pasan el trabajo con una ficha clara y lo ves en directo.",
};

export default function EquipoConectado() {
  return (
    <PaginaSeccion
      ruta="/equipo-conectado"
      antetitulo="Equipo conectado"
      titular="Tus departamentos se pasan el trabajo entre ellos"
      subtitulo="Cuando un agente termina su parte, pasa una ficha al siguiente. Nadie empieza de cero y tú lo ves en directo."
      video="hero-oficina-cobra-vida"
      secundario={{ href: "/como-empezar", label: "Cómo empezar" }}
      provisional
    >
      <Bloque id="cadena" titulo="Del anuncio a la venta" intro={<>Cada traspaso queda registrado y cuesta {CONSUMOS_FIJOS.traspaso} crédito.</>}>
        <CadenaDemo />
      </Bloque>
      <Bloque id="reglas" titulo="Con reglas claras">
        <Provisionales
          items={[
            { titulo: "Solo a quien tú configuras", texto: "Contenido provisional: destinos de traspaso por agente." },
            { titulo: "Cadenas con final", texto: "Contenido provisional: máximo de pasos y bucles detectados." },
            { titulo: "Memoria compartida", texto: "Contenido provisional: todos saben lo que ya pasó con cada contacto." },
          ]}
        />
      </Bloque>
    </PaginaSeccion>
  );
}
