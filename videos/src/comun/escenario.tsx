import { loadFont } from "@remotion/google-fonts/Poppins";
import type { CSSProperties, ReactNode } from "react";
import { AbsoluteFill, useVideoConfig } from "remotion";
import { ETIQUETA_DEMO } from "../../datos-ejemplo";
import "../estilos.css";

const { fontFamily } = loadFont("normal", { weights: ["400", "600"], subsets: ["latin", "latin-ext"] });

/**
 * Los componentes de la oficina están pensados para píxeles de pantalla (texto de 13-15 px). Se diseña
 * sobre un lienzo de 1280 × 720 (o 720 × 1280 en vertical) y se escala ×1,5 al tamaño del vídeo:
 * mismos tamaños relativos que en la app y texto legible en 1080p.
 */
export const ESCALA = 1.5;

export function useLienzo() {
  const { width, height } = useVideoConfig();
  const vertical = height > width;
  return { vertical, ancho: width / ESCALA, alto: height / ESCALA };
}

export function Escenario({ children }: { children: ReactNode }) {
  const { ancho, alto } = useLienzo();
  return (
    <AbsoluteFill style={{ backgroundColor: "#000", fontFamily, ["--font-poppins" as string]: fontFamily } as CSSProperties}>
      <div
        className="text-white"
        style={{ position: "absolute", left: 0, top: 0, width: ancho, height: alto, scale: String(ESCALA), transformOrigin: "0 0", fontFamily }}
      >
        {children}
      </div>
    </AbsoluteFill>
  );
}

/** Etiqueta discreta obligatoria en todos los vídeos. */
export function EtiquetaDemo() {
  return (
    <div
      className="absolute right-4 bottom-4 rounded-pill bg-black/45 px-3 py-1 text-tiny text-white/80 ring-1 ring-white/15"
      style={{ zIndex: 50 }}
    >
      {ETIQUETA_DEMO}
    </div>
  );
}
