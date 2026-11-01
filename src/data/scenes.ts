export type SceneId = "dia" | "atardecer" | "noche";

export type Scene = {
  id: SceneId;
  label: string;
  src: string;
  /** Opacidad del negro superpuesto, de arriba a abajo (más oscuro cuanto más claro es el fondo). */
  overlay: [top: number, bottom: number];
};

/** Para cambiar una escena basta con sustituir su imagen en `public/scenes/`. */
export const scenes: Scene[] = [
  { id: "dia", label: "Día", src: "/scenes/oficina-dia.jpg", overlay: [0.4, 0.5] },
  { id: "atardecer", label: "Atardecer", src: "/scenes/oficina-atardecer.png", overlay: [0.35, 0.5] },
  { id: "noche", label: "Noche", src: "/scenes/oficina-noche.jpg", overlay: [0.25, 0.45] },
];

export const defaultScene: SceneId = "atardecer";
