import type { Metadata } from "next";
import { Bot, GraduationCap, Wrench, type LucideIcon } from "lucide-react";
import { GlassPanel } from "@/components/glass";
import { CalculadoraYComparacion } from "@/components/precios/CalculadoraYComparacion";
import { PacksCristal } from "@/components/precios/PacksCristal";
import { TarifasAnimadas } from "@/components/precios/TarifasAnimadas";
import { PreguntasFrecuentes } from "@/components/publico/PreguntasFrecuentes";
import { Bloque, PaginaSeccion } from "@/components/publico/plantilla/PaginaSeccion";
import { ideasPrecios, preguntasPrecios } from "@/content/precios";
import { TIPOS_DE_TAREA } from "@/lib/creditos/tarifas";
import { caducidad } from "@/lib/publico/estimacion";
import { packsPublicos } from "@/lib/publico/packs";

export const metadata: Metadata = {
  title: "Precios",
  description: "Paga solo por lo que hacen tus agentes, con créditos. Sin cuotas: departamentos y agentes gratis. 1 crédito = 1 céntimo.",
};

const SERVICIOS: { icono: LucideIcon; titulo: string; texto: string }[] = [
  { icono: Wrench, titulo: "Implantación", texto: "Conectamos tus herramientas y dejamos funcionando tu primera cadena contigo." },
  { icono: Bot, titulo: "Agentes a medida", texto: "Diseñamos agentes para procesos propios de tu negocio, certificados por MyOfia." },
  { icono: GraduationCap, titulo: "Horas de experto", texto: "Una persona de nuestro equipo revisa tus agentes y te ayuda a sacarles partido." },
];

// Aviso interno de supuestos pendientes: en local y en despliegues de prueba, nunca en producción.
const enPruebas = process.env.NODE_ENV !== "production" || ["preview", "development"].includes(process.env.VERCEL_ENV ?? "");

export default async function Precios() {
  const packs = await packsPublicos();
  const recurrente = packs?.find((p) => !p.soloUnaVez);
  const prueba = packs?.find((p) => p.soloUnaVez);

  return (
    <PaginaSeccion
      ruta="/precios"
      antetitulo="Precios"
      titular="Paga solo por lo que hacen tus agentes"
      subtitulo={`Compras créditos y cada tarea gasta una cantidad fija: desde ${TIPOS_DE_TAREA.simple.creditos} créditos una tarea simple. Sin permanencia.`}
      video="creditos"
      secundario={{ href: "#calculadora", label: "Calcular cuánto necesito" }}
      destacados={ideasPrecios}
      final={{ titular: "Pide acceso y empieza con el pack Prueba", texto: "Te ayudamos a montar tu primera cadena y ves lo que gasta de verdad antes de comprar más." }}
    >
      {/* 2 · Qué cuesta cada cosa */}
      <Bloque id="tarifas" antetitulo="Qué cuesta cada cosa" titulo="Un precio fijo por tipo de tarea" intro="Lo sabes antes de empezar, sea cual sea el trabajo que haya detrás.">
        <TarifasAnimadas />
      </Bloque>

      {/* 3 · Packs */}
      <Bloque id="packs" antetitulo="Packs de créditos" titulo="Elige cuántos créditos quieres">
        {packs ? (
          <PacksCristal packs={packs} />
        ) : (
          <GlassPanel className="p-6 text-body text-ink-2">Ahora no podemos mostrar los packs. Vuelve a intentarlo en unos minutos.</GlassPanel>
        )}
      </Bloque>

      {/* 4 y 5 · Calculadora y comparación con contratar */}
      <CalculadoraYComparacion packs={packs} supuestosPendientes={enPruebas} />

      {/* 6 · Servicios */}
      <Bloque id="servicios" antetitulo="Servicios" titulo="Si quieres que lo hagamos contigo">
        <ul className="grid gap-4 md:grid-cols-3">
          {SERVICIOS.map(({ icono: Icono, titulo, texto }) => (
            <li key={titulo} className="glass flex flex-col rounded-card p-6">
              <Icono size={22} aria-hidden="true" />
              <h3 className="mt-3 text-h2">{titulo}</h3>
              <p className="mt-2 flex-1 text-body text-ink-2">{texto}</p>
              <p className="mt-4 text-small font-semibold">Según proyecto</p>
            </li>
          ))}
        </ul>
      </Bloque>

      {/* 7 · Preguntas frecuentes de precios */}
      <Bloque id="preguntas" antetitulo="Preguntas frecuentes" titulo="Lo que nos preguntan de los precios">
        <PreguntasFrecuentes
          preguntas={preguntasPrecios(recurrente ? caducidad(recurrente.diasCaducidad) : "12 meses", prueba ? caducidad(prueba.diasCaducidad) : null)}
        />
      </Bloque>
    </PaginaSeccion>
  );
}
