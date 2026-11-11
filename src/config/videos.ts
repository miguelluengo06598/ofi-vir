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
  "departamento-ventas": { ...H, disponible: false, segundos: 11, descripcion: "Ventas: un lead nuevo, su cualificación y la cita propuesta. Datos de ejemplo." },
  "departamento-atencion-al-cliente": { ...H, disponible: false, segundos: 11, descripcion: "Atención: una conversación de WhatsApp resuelta y una queja derivada a una persona. Datos de ejemplo." },
  "departamento-marketing": { ...H, disponible: false, segundos: 11, descripcion: "Marketing: el panel de campañas y tres propuestas ordenadas por impacto. Datos de ejemplo." },
  "departamento-operaciones-crm": { ...H, disponible: false, segundos: 11, descripcion: "Operaciones · CRM: contactos duplicados que se fusionan y fichas que se completan. Datos de ejemplo." },
  "departamento-direccion": { ...H, disponible: false, segundos: 11, descripcion: "Dirección: Atlas resume el día y reparte objetivos. Datos de ejemplo." },
  "cadena-anuncio-a-venta": {
    ...H,
    disponible: false,
    segundos: 20,
    // Anuncio → Lucía responde → aprobación pedida → aprobada → Iván registra → Marketing aprende.
    marcas: [0, 3, 6.5, 9.5, 12.5, 16],
    descripcion:
      "Un anuncio de Meta genera un lead, Lucía responde en minutos, se pide y se da la aprobación del correo, Iván lo registra en el CRM y Marketing recibe qué leads compran. Datos de ejemplo.",
  },
  aprobaciones: {
    ...H,
    disponible: false,
    segundos: 10,
    descripcion: "Aprobaciones: un borrador de correo, el cursor edita una frase y pulsa Aprobar; el correo sale con su estado «Entregado». Datos de ejemplo.",
  },
  memoria: {
    ...H,
    disponible: false,
    segundos: 10,
    descripcion: "Memoria: la constelación de lo que sabe la oficina se ilumina al pulsar un contacto. Datos de ejemplo.",
  },
  creditos: {
    ...H,
    disponible: false,
    segundos: 8,
    descripcion: "Créditos: el saldo, el consumo por agente y una tarea que descuenta sus créditos. Datos de ejemplo.",
  },
  "configurar-agente": {
    ...H,
    disponible: false,
    segundos: 20,
    descripcion:
      "El asistente «Cuéntanos tu negocio»: alguien describe su clínica, la ficha del agente se rellena sola, se conecta WhatsApp, se prueba en el simulador y se envía a certificación. Datos de ejemplo.",
  },
  certificacion: {
    ...H,
    disponible: false,
    segundos: 12,
    descripcion:
      "Certificación: el agente responde a casos ficticios, pasa el examen técnico y una persona del equipo revisa el resultado antes de activarlo. Datos de ejemplo.",
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
