"use client";

import Link from "next/link";
import { motion, useMotionValueEvent, useScroll, useTransform, type MotionValue } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { useRef, useState } from "react";
import { Avatar } from "@/components/glass";
import { departmentMeta } from "@/components/glass/tokens";
import { usePreferencias } from "@/components/marketing/preferencias";
import { DEPARTAMENTOS, type DepartamentoPublico } from "@/content/departamentos";
import { useMediaQuery } from "@/lib/useMediaQuery";

/** Desde dónde llega cada panel (px y grados), antes de colocarse en su sitio. */
const ORIGEN = [
  { x: -180, y: 140, r: -7 },
  { x: 120, y: 220, r: 5 },
  { x: -60, y: 180, r: -3 },
  { x: 200, y: 260, r: 6 },
  { x: -140, y: 200, r: -5 },
];

const totalAgentes = DEPARTAMENTOS.reduce((n, d) => n + d.agentes.length, 0);
/** Posición del primer agente de cada departamento en el orden de encendido. */
const PRIMER_AGENTE = DEPARTAMENTOS.map((_, i) => DEPARTAMENTOS.slice(0, i).reduce((n, d) => n + d.agentes.length, 0));

/**
 * Los cinco departamentos llegan flotando y se colocan en su sitio según se baja; cuando están en su
 * sitio, sus agentes se encienden uno a uno. Cada panel enlaza a su página. Solo transform y opacity.
 * Con movimiento reducido: paneles en su sitio y agentes encendidos desde el principio.
 */
export function DepartamentosEnSuSitio() {
  const zona = useRef<HTMLUListElement>(null);
  const { reducido } = usePreferencias();
  const ancho = useMediaQuery("(min-width: 1024px)");
  const { scrollYProgress } = useScroll({ target: zona, offset: ["start end", "center center"] });
  const [encendidos, setEncendidos] = useState(0);

  // Los agentes se encienden en el último tramo, cuando los paneles ya casi están colocados.
  useMotionValueEvent(scrollYProgress, "change", (p) => {
    const n = Math.max(0, Math.min(totalAgentes, Math.floor(((p - 0.7) / 0.28) * totalAgentes) + 1));
    setEncendidos((e) => (e === n ? e : n));
  });

  return (
    <ul ref={zona} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
      {DEPARTAMENTOS.map((d, i) => {
        const primero = PRIMER_AGENTE[i];
        return (
          <Panel
            key={d.slug}
            d={d}
            progreso={scrollYProgress}
            origen={ORIGEN[i]}
            escala={ancho ? 1 : 0.35}
            reducido={reducido}
            encendido={(k) => reducido || encendidos > primero + k}
          />
        );
      })}
    </ul>
  );
}

function Panel({ d, progreso, origen, escala, reducido, encendido }: {
  d: DepartamentoPublico; progreso: MotionValue<number>; origen: { x: number; y: number; r: number }; escala: number; reducido: boolean; encendido: (k: number) => boolean;
}) {
  const x = useTransform(progreso, [0, 0.85], [origen.x * escala, 0]);
  const y = useTransform(progreso, [0, 0.85], [origen.y * escala, 0]);
  const rotate = useTransform(progreso, [0, 0.85], [origen.r, 0]);
  const opacity = useTransform(progreso, [0, 0.45], [0, 1]);
  const meta = departmentMeta[d.tono];
  const Icono = meta.icon;
  const activos = d.agentes.filter((_, k) => encendido(k)).length;

  return (
    <motion.li style={reducido ? undefined : { x, y, rotate, opacity }} className="will-change-transform">
      <Link href={`/departamentos/${d.slug}`} className="glass glass-interactive group flex h-full flex-col overflow-hidden rounded-card text-white">
        <span className={`flex items-center gap-2 px-4 py-3 text-small font-semibold ${meta.header}`}>
          <Icono size={16} aria-hidden="true" /> {d.nombre}
        </span>
        <span className="flex flex-1 flex-col gap-3 p-4">
          <span className="text-small text-ink-2">{d.linea}</span>
          <span className="flex -space-x-2">
            {d.agentes.map((a, k) => (
              <span key={a.nombre} className="relative rounded-full">
                <span
                  aria-hidden="true"
                  className="absolute -inset-0.5 rounded-full transition-opacity duration-500 motion-reduce:transition-none"
                  style={{ opacity: encendido(k) ? 1 : 0, boxShadow: "0 0 0 2px rgba(255,255,255,0.9), 0 0 18px 3px rgba(255,212,138,0.7)" }}
                />
                <Avatar name={a.nombre} tone={d.tono} size={34} status={encendido(k) ? "working" : "paused"} />
              </span>
            ))}
          </span>
          <span className="text-tiny text-ink-2" aria-hidden="true">
            {activos > 0 ? `${activos} de ${d.agentes.length} trabajando` : "Esperando trabajo"}
          </span>
          <span className="mt-auto inline-flex items-center gap-1.5 text-small font-semibold">
            Ver {d.nombre} <ArrowRight size={15} aria-hidden="true" className="transition-transform group-hover:translate-x-0.5" />
          </span>
        </span>
      </Link>
    </motion.li>
  );
}
