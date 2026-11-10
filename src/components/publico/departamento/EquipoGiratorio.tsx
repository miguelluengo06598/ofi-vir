"use client";

import { RotateCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Avatar } from "@/components/glass";
import type { DepartmentId } from "@/components/glass/tokens";
import { usePreferencias } from "@/components/marketing/preferencias";
import type { AgenteFicha } from "@/content/departamentos";
import { PorRevisar } from "./PorRevisar";

/**
 * «Conoce a tu equipo»: una tarjeta de cristal por agente que se voltea al pasar el ratón (o al tocarla /
 * pulsar Intro) y muestra qué hace. Cada cara gira por su cuenta con perspective() + rotateY y la cara oculta
 * queda de espaldas: sin preserve-3d en el padre, para que el desenfoque del cristal siga funcionando.
 * Solo transform. Con movimiento reducido no gira: las dos caras se ven una debajo de otra.
 */
export function EquipoGiratorio({ agentes, tono, acento }: { agentes: AgenteFicha[]; tono: DepartmentId; acento: string }) {
  const { reducido } = usePreferencias();
  return (
    <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {agentes.map((a) => (
        <li key={a.nombre}>{reducido ? <Fija a={a} tono={tono} acento={acento} /> : <Giratoria a={a} tono={tono} acento={acento} />}</li>
      ))}
    </ul>
  );
}

type P = { a: AgenteFicha; tono: DepartmentId; acento: string };

function Delante({ a, tono, acento }: P) {
  return (
    <>
      <span aria-hidden="true" className="absolute inset-x-0 top-0 h-28 rounded-t-card opacity-70" style={{ background: `linear-gradient(180deg, ${acento}66, transparent)` }} />
      <span className="relative flex flex-col items-center gap-4 text-center">
        <span className="rounded-full p-1" style={{ boxShadow: `0 0 0 1px rgba(255,255,255,0.35), 0 0 36px 4px ${acento}88` }}>
          <Avatar name={a.nombre} tone={tono} size={84} />
        </span>
        <span>
          <span className="block text-[22px] font-semibold">{a.nombre}</span>
          <span className="mt-0.5 block text-small text-ink-2">{a.rol}</span>
        </span>
        <span className="text-body text-white/90">{a.linea}</span>
        {!a.plantilla && <span className="rounded-pill bg-white/10 px-2.5 py-0.5 text-tiny text-ink-2 ring-1 ring-white/20">En preparación</span>}
      </span>
    </>
  );
}

function Detras({ a, acento }: P) {
  return (
    <div className="flex flex-1 flex-col">
      <span className="text-tiny font-semibold tracking-[0.18em] text-ink-2 uppercase">Qué hace {a.nombre}</span>
      <ul className="mt-4 space-y-3">
        {a.queHace.map((q) => (
          <li key={q} className="flex gap-2.5 text-[15px] leading-snug text-white/90">
            <span aria-hidden="true" className="mt-[7px] size-1.5 shrink-0 rounded-full" style={{ background: acento }} />
            {q}
          </li>
        ))}
      </ul>
      <PorRevisar revisar={a.revisar} className="mt-auto" />
    </div>
  );
}

const cara = "glass absolute inset-0 flex flex-col overflow-hidden rounded-card p-6 transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] [backface-visibility:hidden]";

function Giratoria(p: P) {
  const [fijada, setFijada] = useState(false);
  const [encima, setEncima] = useState(false);
  const girada = fijada || encima;
  const verDetras = useRef<HTMLButtonElement>(null);
  const verDelante = useRef<HTMLButtonElement>(null);
  const porTeclado = useRef(false);

  // Al girar con el teclado, el foco pasa al botón de la cara que queda a la vista.
  useEffect(() => {
    if (!porTeclado.current) return;
    porTeclado.current = false;
    (girada ? verDelante : verDetras).current?.focus();
  }, [girada]);

  return (
    // El clic en cualquier parte gira la tarjeta (tocar en móvil); los botones son la vía del teclado y del
    // lector de pantalla: su clic sube hasta aquí. La cara oculta queda inerte.
    <div
      onClick={(e) => {
        porTeclado.current = e.detail === 0;
        setFijada((f) => !f);
      }}
      onPointerEnter={(e) => e.pointerType === "mouse" && setEncima(true)}
      onPointerLeave={(e) => e.pointerType === "mouse" && setEncima(false)}
      className="relative h-[360px] cursor-pointer rounded-card text-white"
    >
      <div inert={girada} className={cara} style={{ transform: `perspective(1100px) rotateY(${girada ? -180 : 0}deg)` }}>
        <Delante {...p} />
        <button ref={verDetras} type="button" className="mt-auto inline-flex items-center gap-1.5 self-center rounded-pill px-3 py-1.5 text-tiny text-ink-2 hover:text-white">
          <RotateCw size={13} aria-hidden="true" /> Ver qué hace {p.a.nombre}
        </button>
      </div>
      <div inert={!girada} className={`${cara} is-active`} style={{ transform: `perspective(1100px) rotateY(${girada ? 0 : 180}deg)` }}>
        <Detras {...p} />
        <button ref={verDelante} type="button" className="mt-4 inline-flex items-center gap-1.5 self-start rounded-pill px-0 py-1.5 text-tiny text-ink-2 hover:text-white">
          <RotateCw size={13} aria-hidden="true" /> Volver
        </button>
      </div>
    </div>
  );
}

function Fija(p: P) {
  return (
    <div className="glass relative flex h-full flex-col gap-6 overflow-hidden rounded-card p-6 text-white">
      <Delante {...p} />
      <Detras {...p} />
    </div>
  );
}
