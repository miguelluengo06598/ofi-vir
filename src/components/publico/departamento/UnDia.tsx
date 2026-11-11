"use client";

import { motion, useMotionValueEvent, useScroll, useSpring } from "framer-motion";
import { Moon, Sun } from "lucide-react";
import { useRef, useState } from "react";
import { usePreferencias } from "@/components/marketing/preferencias";
import { LUZ } from "@/components/marketing/tipografia";
import type { MomentoDelDia } from "@/content/departamentos";
import { creditosParaTarea } from "@/lib/creditos/tarifas";
import { PorRevisar } from "./PorRevisar";

const NOMBRE_TIPO = { simple: "Tarea simple", estandar: "Tarea estándar", experta: "Tarea experta" } as const;

/**
 * «Un día con…»: línea de tiempo que se va llenando de luz al bajar. Cada momento se enciende cuando su
 * parte de arriba cruza el 65 % de la pantalla y se queda encendido. Solo transform (la tarjeta de cristal
 * se desplaza y cambia a su variante activa; nunca opacity sobre el cristal).
 * Con movimiento reducido: línea llena y todos los momentos encendidos desde el principio.
 */
export function UnDia({ momentos, acento }: { momentos: MomentoDelDia[]; acento: string }) {
  const zona = useRef<HTMLOListElement>(null);
  const { reducido } = usePreferencias();
  const { scrollYProgress } = useScroll({ target: zona, offset: ["start 65%", "end 65%"] });
  const relleno = useSpring(scrollYProgress, { stiffness: 120, damping: 30, mass: 0.4 });

  return (
    <ol ref={zona} className="relative mx-auto max-w-4xl">
      {/* Raíl y luz que lo recorre */}
      <span aria-hidden="true" className="absolute top-2 bottom-2 left-[15px] w-px bg-white/20 sm:left-[127px]" />
      <motion.span
        aria-hidden="true"
        className="absolute top-2 bottom-2 left-[14px] w-[3px] origin-top rounded-full sm:left-[126px]"
        style={{ scaleY: reducido ? 1 : relleno, background: `linear-gradient(180deg, ${acento}, ${LUZ})`, boxShadow: `0 0 14px ${LUZ}aa` }}
      />
      {momentos.map((m) => (
        <Momento key={`${m.dia ?? ""}${m.hora}`} m={m} acento={acento} reducido={reducido} />
      ))}
    </ol>
  );
}

function Momento({ m, acento, reducido }: { m: MomentoDelDia; acento: string; reducido: boolean }) {
  const ref = useRef<HTMLLIElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 65%", "start 64%"] });
  const [vivo, setVivo] = useState(false);
  useMotionValueEvent(scrollYProgress, "change", (p) => setVivo(p >= 1));
  const encendido = reducido || vivo;
  const Icono = m.fueraDeHorario ? Moon : Sun;

  return (
    <li ref={ref} className="relative grid grid-cols-[32px_1fr] gap-x-4 pb-10 last:pb-0 sm:grid-cols-[96px_32px_1fr] sm:gap-x-6 sm:pb-14">
      <p className="col-start-2 row-start-1 mb-2 sm:col-start-1 sm:mb-0 sm:pt-4 sm:text-right">
        <span className={`block text-[26px] leading-none font-semibold tabular-nums transition-colors duration-500 ${encendido ? "text-white" : "text-white/45"}`}>{m.hora}</span>
        <span className="mt-1 block text-tiny text-ink-2">{m.dia ? `${m.dia}, ` : ""}{m.fueraDeHorario ? "fuera de horario" : "en horario"}</span>
      </p>

      {/* Punto en el raíl */}
      <span aria-hidden="true" className="relative col-start-1 row-start-1 flex justify-center pt-1 sm:col-start-2 sm:row-span-2 sm:pt-4">
        <span
          className="relative flex size-8 items-center justify-center rounded-full bg-black/60 ring-1 ring-white/25 transition-transform duration-500"
          style={{ transform: `scale(${encendido ? 1 : 0.7})` }}
        >
          <span className="absolute inset-0 rounded-full transition-transform duration-500" style={{ background: acento, transform: `scale(${encendido ? 1 : 0})` }} />
          <Icono size={15} className="relative text-white" />
          <span
            className="absolute -inset-2 rounded-full transition-transform duration-700"
            style={{ boxShadow: `0 0 22px 4px ${LUZ}88`, transform: `scale(${encendido ? 1 : 0})` }}
          />
        </span>
      </span>

      <div
        className={`glass col-start-2 rounded-card p-5 transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] sm:col-start-3 sm:row-start-1 sm:p-6 ${encendido ? "is-active" : ""}`}
        // Entra desde abajo: desplazarla hacia un lado la sacaba de la pantalla en móvil.
        style={{ transform: encendido ? "none" : "translateY(18px)" }}
      >
        <div className="flex flex-wrap items-center gap-2 text-tiny">
          <span className="font-semibold text-white">{m.agente}</span>
          {m.tipica && <span className="rounded-pill bg-white/12 px-2 py-0.5 text-ink-2 ring-1 ring-white/15">Tarea típica</span>}
          {m.fueraDeHorario && (
            <span className="inline-flex items-center gap-1 rounded-pill bg-indigo-400/20 px-2 py-0.5 text-indigo-100 ring-1 ring-indigo-300/35">
              <Moon size={11} aria-hidden="true" /> Fuera de horario
            </span>
          )}
        </div>
        <h3 className="mt-2 text-[19px] leading-snug font-semibold">{m.titulo}</h3>
        <blockquote className="mt-3 border-l-2 pl-3 text-[15px] leading-relaxed text-white/80 italic" style={{ borderColor: acento }}>
          {m.entrada}
        </blockquote>
        <p className="mt-3 text-[15px] leading-relaxed text-white/90">{m.hace}</p>
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-tiny text-ink-2">
          {m.esperaAprobacion && (
            <span className="inline-flex items-center gap-1.5 text-status-waiting">
              <span aria-hidden="true" className="size-2 rounded-full bg-status-waiting" /> Espera tu aprobación
            </span>
          )}
          <span>
            {NOMBRE_TIPO[m.tipoTarea]} · {creditosParaTarea(m.tipoTarea)} créditos
          </span>
        </div>
        <PorRevisar revisar={m.revisar} className="mt-3" />
      </div>
    </li>
  );
}
