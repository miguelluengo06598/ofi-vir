import { Easing, interpolate } from "remotion";

const suave = Easing.bezier(0.22, 1, 0.36, 1);

/** 0→1 entre dos fotogramas, con la curva de entrada de la web. */
export const entre = (f: number, desde: number, hasta: number, curva = suave) =>
  interpolate(f, [desde, hasta], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: curva });

/** Sube (0→1) en [a, b] y baja (1→0) en [c, d]. */
export const ventana = (f: number, a: number, b: number, c: number, d: number) =>
  Math.min(entre(f, a, b), 1 - entre(f, c, d, Easing.in(Easing.cubic)));

/** Pulso 0→1→0 centrado en `centro`, de `duracion` fotogramas. */
export const pulso = (f: number, centro: number, duracion: number) => {
  const t = (f - centro) / (duracion / 2);
  return Math.abs(t) >= 1 ? 0 : 1 - t * t;
};
