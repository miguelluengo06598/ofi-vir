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
  // Representativos (símbolos, no la interfaz tal cual): ver src/comun/simbolos.tsx.
  { id: "departamento-ventas", segundos: 11, formato: "horizontal", poster: 4.0 },
  { id: "departamento-atencion-al-cliente", segundos: 11, formato: "horizontal", poster: 7.5 },
  { id: "departamento-marketing", segundos: 11, formato: "horizontal", poster: 7.5 },
  { id: "departamento-operaciones-crm", segundos: 11, formato: "horizontal", poster: 7.6 },
  { id: "departamento-direccion", segundos: 11, formato: "horizontal", poster: 6.0 },
  { id: "cadena-anuncio-a-venta", segundos: 20, formato: "horizontal", poster: 10.5 },
  { id: "aprobaciones", segundos: 10, formato: "horizontal", poster: 7.5 },
  { id: "memoria", segundos: 10, formato: "horizontal", poster: 4.0 },
  { id: "creditos", segundos: 8, formato: "horizontal", poster: 5.8 },
  { id: "configurar-agente", segundos: 20, formato: "horizontal", poster: 13.5 },
  { id: "certificacion", segundos: 12, formato: "horizontal", poster: 9.8 },
];
