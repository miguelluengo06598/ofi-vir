/**
 * Escala tipográfica fluida de la presentación (ver docs/web-direccion-de-arte.md).
 * Mínimo en móvil (360 px) → máximo en escritorio grande (1440 px), con clamp(). Poppins 600 en titulares.
 * Las clases son utilidades de Tailwind: combinar con text-balance en titulares.
 */
export const tipo = {
  /** Portada: una sola por página. 44 → 96 px. */
  display: "text-[clamp(2.75rem,1.5rem+5.5vw,6rem)] leading-[0.98] font-semibold tracking-[-0.035em]",
  /** Titular de sección a pantalla completa. 34 → 64 px. */
  titular: "text-[clamp(2.125rem,1.4rem+3.2vw,4rem)] leading-[1.04] font-semibold tracking-[-0.03em]",
  /** Titular de sección densa o de panel. 24 → 36 px. */
  subtitular: "text-[clamp(1.5rem,1.2rem+1.3vw,2.25rem)] leading-[1.15] font-semibold tracking-[-0.02em]",
  /** Entradilla bajo un titular. 17 → 21 px. */
  entradilla: "text-[clamp(1.0625rem,0.98rem+0.4vw,1.3125rem)] leading-[1.5] text-ink-2",
  /** Cuerpo sobre cristal: 16 px fijo, interlineado amplio. */
  cuerpo: "text-[16px] leading-[1.65] text-white/90",
  /** Antetítulo en versalitas. */
  antetitulo: "text-[12px] font-semibold tracking-[0.18em] uppercase text-ink-2",
  /** Cifras grandes (contadores): números tabulares para que no bailen. */
  cifra: "text-[clamp(2.5rem,1.6rem+3.6vw,4.5rem)] leading-none font-semibold tracking-[-0.03em] tabular-nums",
} as const;

/** Sombra de texto para lo que va directamente sobre la escena (no sobre cristal). */
export const sobreEscena = "[text-shadow:0_2px_18px_rgba(0,0,0,0.55)]";

/** Color de acento de la «luz» de los traspasos: cálido, como las lámparas al anochecer. */
export const LUZ = "#FFD48A";
