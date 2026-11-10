/**
 * Catálogo de vídeos: lo leen el registro de composiciones (Root.tsx) y el script de renderizado.
 * Sin React ni Remotion: se puede importar desde Node. 30 fps y sin sonido en todos.
 * `poster`: segundo más representativo (de ahí sale la imagen fija AVIF/WebP).
 */
export const FPS = 30;

export type VideoDelCatalogo = {
  id: string;
  segundos: number;
  formato: "horizontal" | "vertical";
  poster: number;
  /** Pendiente de construir: todavía no tiene composición. */
  pendiente?: boolean;
};

export const DIMENSIONES = { horizontal: { ancho: 1920, alto: 1080 }, vertical: { ancho: 1080, alto: 1920 } } as const;

export const CATALOGO: VideoDelCatalogo[] = [
  { id: "hero-oficina-cobra-vida", segundos: 15, formato: "horizontal", poster: 8.5 },
  { id: "hero-oficina-cobra-vida-vertical", segundos: 15, formato: "vertical", poster: 8.5 },
];
