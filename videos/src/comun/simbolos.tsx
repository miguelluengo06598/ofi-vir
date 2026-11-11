/**
 * Kit de los vídeos «representativos»: no enseñan pantallas de la oficina tal cual, sino la idea con
 * símbolos (orbes de luz con icono, haces con partícula, fichas abstractas con líneas en vez de texto,
 * sellos de «hecho»). Todo se dibuja sobre el lienzo de 1280 × 720 de escenario.tsx y se anima con el
 * número de fotograma. Los colores son los de la app (departamentos, estados y la luz cálida LUZ).
 */
import type { LucideIcon } from "lucide-react";
import { Check } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { AbsoluteFill, Easing, Img, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { LUZ } from "@/components/marketing/tipografia";
import { entre } from "./animar";
import { EtiquetaDemo, Escenario } from "./escenario";

export { LUZ };
export const VERDE = "#34D399";
export const AMBAR = "#FBBF24";
export const AZUL = "#4F8CFF";

export type Punto = { x: number; y: number };

/** `#RRGGBB` + opacidad (0-1) → `#RRGGBBAA`. */
export const alfa = (color: string, a: number) =>
  color + Math.round(Math.max(0, Math.min(1, a)) * 255).toString(16).padStart(2, "0");

/** Fotograma, conversor de segundos, duración y `ciclo` (0→1→0 en coseno: el bucle no tiene costura). */
export function useTiempo() {
  const f = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const s = (seg: number) => seg * fps;
  const total = durationInFrames / fps;
  const ciclo = (1 - Math.cos((2 * Math.PI * f) / durationInFrames)) / 2;
  /** 1 en el centro del vídeo; 0 al principio y al final, para que el último fotograma enlace con el primero. */
  const vida = (entra = 0.7, sale = 0.9) => Math.min(entre(f, 0, s(entra)), 1 - entre(f, s(total - sale), s(total - 0.05)));
  return { f, s, total, ciclo, vida };
}

/** Pop con rebote suave para sellos y apariciones (0→1). */
export const pop = (f: number, desde: number, hasta: number) =>
  interpolate(f, [desde, hasta], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.back(2.2)) });

/** Fondo común: la oficina al atardecer desenfocada que respira, un tinte del color del vídeo y la etiqueta. */
export function Lienzo({ tinte, foco = { x: 65, y: 40 }, escena = "oficina-atardecer.png", children }: {
  tinte?: string; foco?: { x: number; y: number }; escena?: string; children: ReactNode;
}) {
  const { ciclo } = useTiempo();
  return (
    <Escenario>
      <AbsoluteFill style={{ scale: String(1.08 + 0.04 * ciclo), transformOrigin: "50% 55%" }}>
        <Img
          src={staticFile(`scenes/${escena}`)}
          style={{ position: "absolute", width: "100%", height: "100%", objectFit: "cover", filter: "blur(9px) saturate(118%)" }}
        />
      </AbsoluteFill>
      <AbsoluteFill style={{ background: "linear-gradient(rgba(6,9,22,0.50), rgba(6,9,22,0.70))" }} />
      {tinte && (
        <AbsoluteFill style={{ background: `radial-gradient(55% 60% at ${foco.x}% ${foco.y}%, ${alfa(tinte, 0.32 + 0.1 * ciclo)}, transparent 72%)` }} />
      )}
      <AbsoluteFill>{children}</AbsoluteFill>
      <AbsoluteFill style={{ background: "radial-gradient(ellipse at 50% 45%, rgba(0,0,0,0) 58%, rgba(0,0,0,0.42) 100%)" }} />
      <EtiquetaDemo />
    </Escenario>
  );
}

/** Orbe de luz con icono: un agente, un canal o un resultado. */
export function Orbe({ p, r = 34, color, Icono, visible = 1, brillo = 0, onda = 0, escala = 1, estilo }: {
  p: Punto; r?: number; color: string; Icono: LucideIcon; visible?: number; brillo?: number;
  /** 0→1: un anillo que sale del orbe y se desvanece. */
  onda?: number; escala?: number; estilo?: CSSProperties;
}) {
  if (visible <= 0.001) return null;
  return (
    <div
      style={{
        position: "absolute", left: p.x - r, top: p.y - r, width: 2 * r, height: 2 * r,
        opacity: visible, scale: String((0.6 + 0.4 * visible) * escala), ...estilo,
      }}
    >
      <div
        style={{
          position: "absolute", inset: -r * (1 + 0.5 * brillo), borderRadius: 999,
          background: `radial-gradient(circle, ${alfa(color, 0.28 + 0.45 * brillo)} 0%, transparent 66%)`,
        }}
      />
      {onda > 0 && onda < 1 && (
        <div
          style={{
            position: "absolute", inset: -onda * r * 1.4, borderRadius: 999,
            border: `2px solid ${alfa(color, 0.9)}`, opacity: 1 - onda,
          }}
        />
      )}
      <div
        style={{
          position: "absolute", inset: 0, borderRadius: 999,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: `radial-gradient(circle at 34% 28%, ${alfa(color, 1)}, ${alfa(color, 0.62)} 58%, ${alfa(color, 0.32)})`,
          boxShadow: `inset 0 1px 0 rgba(255,255,255,0.4), 0 0 0 1px rgba(255,255,255,${0.22 + 0.5 * brillo}), 0 10px 30px rgba(0,0,0,0.35)`,
        }}
      >
        <Icono size={r * 0.92} color="#fff" strokeWidth={1.8} />
      </div>
    </div>
  );
}

/** Punto de una curva cuadrática en t ∈ [0,1]. */
function enCurva(a: Punto, c: Punto, b: Punto, t: number): Punto {
  const u = 1 - t;
  return { x: u * u * a.x + 2 * u * t * c.x + t * t * b.x, y: u * u * a.y + 2 * u * t * c.y + t * t * b.y };
}

function control(a: Punto, b: Punto, curva: number): Punto {
  return { x: (a.x + b.x) / 2 - (b.y - a.y) * curva, y: (a.y + b.y) / 2 + (b.x - a.x) * curva };
}

/** Punto de un haz (para colocar algo que viaja por él). */
export const puntoDelHaz = (desde: Punto, hasta: Punto, t: number, curva = 0.22) => enCurva(desde, control(desde, hasta, curva), hasta, t);

/** Haz de luz curvo entre dos puntos con una partícula que lo recorre (`t` 0→1). */
export function Haz({ id, desde, hasta, t, visible, color1, color2, curva = 0.22, grosor = 2 }: {
  id: string; desde: Punto; hasta: Punto; t: number; visible: number; color1: string; color2?: string; curva?: number; grosor?: number;
}) {
  if (visible <= 0.001) return null;
  const c = control(desde, hasta, curva);
  const p = enCurva(desde, c, hasta, t);
  const brillo = t > 0 && t < 1 ? Math.min(1, t * 8, (1 - t) * 8) : 0;
  return (
    <svg style={{ position: "absolute", inset: 0, overflow: "visible", pointerEvents: "none" }} width="100%" height="100%">
      <defs>
        <linearGradient id={`${id}-g`} gradientUnits="userSpaceOnUse" x1={desde.x} y1={desde.y} x2={hasta.x} y2={hasta.y}>
          <stop offset="0" stopColor={color1} />
          <stop offset="1" stopColor={color2 ?? color1} />
        </linearGradient>
        <radialGradient id={`${id}-r`}>
          <stop offset="0" stopColor={LUZ} stopOpacity="0.95" />
          <stop offset="1" stopColor={LUZ} stopOpacity="0" />
        </radialGradient>
      </defs>
      <path
        d={`M ${desde.x} ${desde.y} Q ${c.x} ${c.y} ${hasta.x} ${hasta.y}`}
        fill="none" stroke={`url(#${id}-g)`} strokeWidth={grosor} strokeLinecap="round" opacity={0.75 * visible}
      />
      <g transform={`translate(${p.x} ${p.y})`} opacity={brillo * visible}>
        <circle r="18" fill={`url(#${id}-r)`} />
        <circle r="4.5" fill="#fff" />
      </g>
    </svg>
  );
}

/** Anchuras de las líneas «de texto» abstractas (deterministas). */
const ANCHOS = [0.92, 0.74, 0.86, 0.58, 0.8, 0.66, 0.9, 0.52];

/**
 * Ficha abstracta: un panel de cristal con líneas en lugar de texto. `relleno` (0→1) va «escribiendo»
 * las líneas una a una; `resalte` ilumina una línea con la luz cálida.
 */
export function Ficha({ x, y, w, lineas = 4, visible = 1, relleno = 1, color = "#ffffff", Icono, resalte, children, alto }: {
  x: number; y: number; w: number; lineas?: number; visible?: number; relleno?: number; color?: string;
  Icono?: LucideIcon; resalte?: { linea: number; p: number; color?: string }; children?: ReactNode; alto?: number;
}) {
  if (visible <= 0.001) return null;
  return (
    <div
      style={{
        position: "absolute", left: x, top: y, width: w, minHeight: alto, opacity: visible, translate: `0px ${(1 - visible) * 18}px`,
        borderRadius: 20, padding: 18, background: "rgba(255,255,255,0.10)", border: "1px solid rgba(255,255,255,0.18)",
        boxShadow: "0 8px 32px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.15)", backdropFilter: "blur(18px) saturate(140%)",
      }}
    >
      {Icono && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <span
            style={{
              width: 30, height: 30, borderRadius: 999, display: "flex", alignItems: "center", justifyContent: "center",
              background: `linear-gradient(135deg, ${color}, ${alfa(color, 0.45)})`,
            }}
          >
            <Icono size={16} color="#fff" />
          </span>
          <span style={{ height: 9, width: "42%", borderRadius: 99, background: "rgba(255,255,255,0.55)" }} />
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {Array.from({ length: lineas }, (_, i) => {
          const lleno = Math.max(0, Math.min(1, relleno * lineas - i));
          const r = resalte && resalte.linea === i ? resalte.p : 0;
          return (
            <span key={i} style={{ position: "relative", height: 8, width: `${ANCHOS[i % ANCHOS.length] * 100}%`, borderRadius: 99, background: "rgba(255,255,255,0.10)" }}>
              <span
                style={{
                  position: "absolute", left: 0, top: 0, bottom: 0, width: `${lleno * 100}%`, borderRadius: 99,
                  background: r > 0 ? `color-mix(in srgb, ${resalte!.color ?? LUZ} ${Math.round(r * 100)}%, rgba(255,255,255,0.5))` : "rgba(255,255,255,0.5)",
                  boxShadow: r > 0 ? `0 0 ${14 * r}px ${alfa(resalte!.color ?? LUZ, 0.7 * r)}` : undefined,
                }}
              />
            </span>
          );
        })}
      </div>
      {children}
    </div>
  );
}

/** Burbuja de conversación abstracta (dos líneas). `lado` decide la alineación y el color. */
export function Burbuja({ p, w = 150, lado, visible, color }: { p: Punto; w?: number; lado: "fuera" | "agente"; visible: number; color?: string }) {
  if (visible <= 0.001) return null;
  const agente = lado === "agente";
  return (
    <div
      style={{
        position: "absolute", left: p.x, top: p.y, width: w, padding: "12px 14px", opacity: visible,
        translate: `${(1 - visible) * (agente ? 14 : -14)}px 0px`, scale: String(0.9 + 0.1 * visible),
        borderRadius: 18, borderBottomLeftRadius: agente ? 18 : 6, borderBottomRightRadius: agente ? 6 : 18,
        background: agente ? alfa(color ?? AZUL, 0.85) : "rgba(255,255,255,0.16)",
        border: "1px solid rgba(255,255,255,0.18)", display: "flex", flexDirection: "column", gap: 7,
      }}
    >
      <span style={{ height: 7, width: "88%", borderRadius: 99, background: "rgba(255,255,255,0.75)" }} />
      <span style={{ height: 7, width: "56%", borderRadius: 99, background: "rgba(255,255,255,0.55)" }} />
    </div>
  );
}

/** Sello circular de «hecho» con rebote (`p` 0→1). */
export function Sello({ p, centro, r = 15, color = VERDE, Icono = Check }: { p: number; centro: Punto; r?: number; color?: string; Icono?: LucideIcon }) {
  if (p <= 0.001) return null;
  return (
    <div
      style={{
        position: "absolute", left: centro.x - r, top: centro.y - r, width: 2 * r, height: 2 * r, borderRadius: 999,
        display: "flex", alignItems: "center", justifyContent: "center", scale: String(p), opacity: Math.min(1, p * 1.5),
        background: color, boxShadow: `0 0 0 3px rgba(0,0,0,0.25), 0 0 22px ${alfa(color, 0.7)}`,
      }}
    >
      <Icono size={r * 1.15} color="#0b1220" strokeWidth={3} />
    </div>
  );
}

/** Rótulo corto bajo un símbolo (dos o tres palabras como mucho). */
export function Rotulo({ p, texto, visible = 1, activo = 0 }: { p: Punto; texto: string; visible?: number; activo?: number }) {
  if (visible <= 0.001) return null;
  return (
    <div
      style={{
        position: "absolute", left: p.x, top: p.y, translate: "-50% 0", opacity: visible * (0.7 + 0.3 * activo), whiteSpace: "nowrap",
        padding: "4px 12px", borderRadius: 999, fontSize: 13, fontWeight: 600, letterSpacing: 0.2,
        background: `rgba(0,0,0,${0.32 + 0.18 * activo})`, border: `1px solid rgba(255,255,255,${0.16 + 0.3 * activo})`,
      }}
    >
      {texto}
    </div>
  );
}

/** Generador pseudoaleatorio determinista (mismo resultado en cada fotograma). */
export function semilla(n: number) {
  let x = n;
  return () => {
    x = (x * 16807) % 2147483647;
    return (x - 1) / 2147483646;
  };
}
