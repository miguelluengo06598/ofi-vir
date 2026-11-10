"use client";

/**
 * Punto de salud (verde, ámbar, rojo) con texto y un tooltip que explica por qué tiene ese color. El tooltip aparece al pasar
 * el ratón o al enfocar con el teclado (Escape lo cierra) y va en posición fija, para que no lo recorte la tabla con scroll.
 * Su texto está enlazado con aria-describedby, así que los lectores de pantalla lo leen sin abrirlo.
 */
import { useRef, useState } from "react";
import { NOMBRE_COLOR, type Salud } from "@/lib/admin/clientes/salud";

const PUNTO = { verde: "bg-status-working", ambar: "bg-status-waiting", rojo: "bg-status-error" } as const;
const TEXTO = { verde: "text-status-working", ambar: "text-status-waiting", rojo: "text-status-error" } as const;
const ANCHO = 288;

export function IndicadorSalud({ salud, id, detalle = false }: { salud: Salud; id: string; detalle?: boolean }) {
  const ancla = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; arriba: boolean } | null>(null);

  if (detalle) {
    return (
      <div className="flex flex-col gap-2">
        <p className="flex items-center gap-2 text-body"><span aria-hidden="true" className={`size-3 rounded-full ${PUNTO[salud.color]}`} /><strong>{NOMBRE_COLOR[salud.color]}</strong></p>
        <ul className="flex flex-col gap-1 text-small">
          {salud.senales.map((s) => (
            <li key={s.texto} className="flex items-center gap-2"><span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${PUNTO[s.color]}`} /><span className={s.color === "verde" ? "text-ink-2" : TEXTO[s.color]}>{s.texto}</span></li>
          ))}
        </ul>
      </div>
    );
  }

  const abrir = () => {
    const r = ancla.current?.getBoundingClientRect();
    if (!r) return;
    const arriba = r.bottom + 180 > window.innerHeight;
    setPos({ top: arriba ? r.top - 8 : r.bottom + 8, left: Math.max(8, Math.min(r.right - ANCHO, window.innerWidth - ANCHO - 8)), arriba });
  };
  const cerrar = () => setPos(null);

  return (
    <>
      <span ref={ancla} tabIndex={0} aria-describedby={`salud-${id}`} onMouseEnter={abrir} onMouseLeave={cerrar} onFocus={abrir} onBlur={cerrar}
        onKeyDown={(e) => e.key === "Escape" && cerrar()}
        className="inline-flex cursor-help items-center gap-1.5 rounded-pill px-1 text-small whitespace-nowrap focus-visible:outline-2 focus-visible:outline-white">
        <span aria-hidden="true" className={`size-2.5 rounded-full ${PUNTO[salud.color]}`} />{NOMBRE_COLOR[salud.color]}
      </span>
      <span id={`salud-${id}`} role="tooltip" hidden={!pos}
        style={pos ? { top: pos.top, left: pos.left, width: ANCHO, transform: pos.arriba ? "translateY(-100%)" : undefined } : undefined}
        className="pointer-events-none fixed z-[70] flex-col gap-0.5 rounded-card border border-glass-border bg-[#0b1220]/95 p-3 text-tiny text-white shadow-lg [&:not([hidden])]:flex">
        <span className="mb-1 block font-semibold">Por qué está en «{NOMBRE_COLOR[salud.color].toLowerCase()}»</span>
        {salud.senales.map((s) => (
          <span key={s.texto} className="flex items-center gap-2"><span aria-hidden="true" className={`size-1.5 shrink-0 rounded-full ${PUNTO[s.color]}`} />{s.texto}</span>
        ))}
      </span>
    </>
  );
}
