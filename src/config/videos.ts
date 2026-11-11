/**
 * Vídeos del producto (generados con `npm run videos`, proyecto videos/):
 *  - Por defecto se sirven desde public/videos, que va en git (son pocos y pequeños) y Vercel los publica.
 *  - Si crecen, alojarlos fuera y apuntar NEXT_PUBLIC_VIDEOS_BASE_URL a su carpeta
 *    (p. ej. https://<cuenta>.r2.dev/videos). Los nombres de archivo son los ids del catálogo.
 * Si el alojamiento es otro dominio, añadirlo a images.remotePatterns de next.config.ts para los pósteres.
 *
 * `disponible: false` = aún no renderizado. Mientras tanto la web usa el vídeo provisional (el hero)
 * y lo indica; al renderizarlo, cambiar a true.
 */

const BASE = (process.env.NEXT_PUBLIC_VIDEOS_BASE_URL?.trim() || "/videos").replace(/\/+$/, "");

type Entrada = {
  ancho: number;
  alto: number;
  descripcion: string;
  disponible: boolean;
  /** Duración en segundos y, si el vídeo cuenta pasos, el segundo en que empieza cada uno (para sincronizar texto). */
  segundos: number;
  marcas?: number[];
};
const H = { ancho: 1920, alto: 1080 };

const VIDEOS = {
  "hero-oficina-cobra-vida": {
    ...H,
    disponible: true,
    segundos: 15,
    descripcion:
      "La oficina al atardecer: aparecen los cinco departamentos, entra un lead de Meta, Lucía lo atiende y lo pasa a Iván, que actualiza la ficha en el CRM. Datos de ejemplo.",
  },
  "hero-oficina-cobra-vida-vertical": {
    ancho: 1080,
    alto: 1920,
    disponible: true,
    segundos: 15,
    descripcion: "Versión vertical: un lead de Meta pasa de Lucía, en Ventas, a Iván, en el CRM, y la ficha se actualiza. Datos de ejemplo.",
  },
  "departamento-ventas": { ...H, disponible: true, segundos: 11, descripcion: "Ventas, en símbolos: los leads llegan como puntos de luz al agente de ventas y los que encajan acaban en una cita confirmada. Datos de ejemplo." },
  "departamento-atencion-al-cliente": { ...H, disponible: true, segundos: 11, descripcion: "Atención, en símbolos: una conversación se va resolviendo burbuja a burbuja y una queja pasa a una persona del equipo. Datos de ejemplo." },
  "departamento-marketing": { ...H, disponible: true, segundos: 11, descripcion: "Marketing, en símbolos: las barras de resultados crecen y tres propuestas se reordenan por impacto. Datos de ejemplo." },
  "departamento-operaciones-crm": { ...H, disponible: true, segundos: 11, descripcion: "Operaciones · CRM, en símbolos: dos fichas duplicadas se funden en una y la ficha se completa. Datos de ejemplo." },
  "departamento-direccion": { ...H, disponible: true, segundos: 11, descripcion: "Dirección, en símbolos: los departamentos envían su resumen al centro y reciben de vuelta sus objetivos. Datos de ejemplo." },
  "cadena-anuncio-a-venta": {
    ...H,
    disponible: true,
    segundos: 20,
    // Anuncio → Lucía responde → aprobación pedida → aprobada → Iván registra → Marketing aprende.
    marcas: [0, 3, 6.5, 9.5, 12.5, 16],
    descripcion:
      "La cadena en símbolos: un anuncio genera un lead, Lucía responde, se pide y se da la aprobación, Iván lo registra en el CRM y Marketing aprende de vuelta. Datos de ejemplo.",
  },
  aprobaciones: {
    ...H,
    disponible: true,
    segundos: 10,
    descripcion:
      "Aprobaciones en símbolos: un borrador espera, se retoca una frase, una persona pulsa Aprobar y el correo llega con su doble check de entregado. Datos de ejemplo.",
  },
  memoria: {
    ...H,
    disponible: true,
    segundos: 10,
    descripcion:
      "Memoria en símbolos: una constelación de recuerdos; al pulsar un contacto se encienden los recuerdos relacionados. Datos de ejemplo.",
  },
  creditos: {
    ...H,
    disponible: true,
    segundos: 8,
    descripcion:
      "Créditos en símbolos: un anillo de saldo se va gastando en tres tareas de distinto tamaño, que se marcan como hechas. Datos de ejemplo.",
  },
  "configurar-agente": {
    ...H,
    disponible: true,
    segundos: 20,
    descripcion:
      "Configurar un agente en símbolos: cuentas cómo es tu negocio, la ficha del agente se rellena sola, se conecta un canal, se prueba en el simulador y se envía a certificación. Datos de ejemplo.",
  },
  certificacion: {
    ...H,
    disponible: true,
    segundos: 12,
    descripcion:
      "Certificación en símbolos: el agente cruza las cuatro pruebas del examen técnico, una persona lo revisa y recibe su sello de certificado. Datos de ejemplo.",
  },
} satisfies Record<string, Entrada>;

export type VideoId = keyof typeof VIDEOS;

export type FuentesDeVideo = {
  id: VideoId;
  mp4: string;
  webm: string;
  posterAvif: string;
  posterWebp: string;
  ancho: number;
  alto: number;
  descripcion: string;
  segundos: number;
  /** Marcas del vídeo PEDIDO (no del provisional): segundo en que empieza cada paso. */
  marcas?: number[];
  /** true si se está usando el vídeo provisional en lugar del pedido. */
  provisional: boolean;
};

const PROVISIONAL: VideoId = "hero-oficina-cobra-vida";

/** URLs de un vídeo, listas para <VideoProducto>. Si aún no existe, las del provisional. */
export function video(id: VideoId): FuentesDeVideo {
  const real = VIDEOS[id].disponible ? id : PROVISIONAL;
  const url = (ext: string) => `${BASE}/${real}.${ext}`;
  const e: Entrada = VIDEOS[real];
  const pedido: Entrada = VIDEOS[id];
  return {
    id: real, mp4: url("mp4"), webm: url("webm"), posterAvif: url("avif"), posterWebp: url("webp"),
    ancho: e.ancho, alto: e.alto, descripcion: e.descripcion, segundos: e.segundos, marcas: pedido.marcas, provisional: real !== id,
  };
}
