import type { MetadataRoute } from "next";
import { DEPARTAMENTOS } from "@/content/departamentos";
import { SECTORES } from "@/content/sectores";

const sitio = process.env.NEXT_PUBLIC_SITE_URL?.trim();
const indexable = process.env.VERCEL_ENV === "production" && Boolean(sitio);
const rutas = ["", "/producto", "/departamentos", "/equipo-conectado", "/sectores", "/como-empezar", "/precios", "/seguridad", "/privacidad", "/condiciones", "/cookies", "/aviso-legal"];

/** Solo se publica en producción con una URL canónica declarada; nunca enumera el laboratorio ni rutas privadas. */
export default function sitemap(): MetadataRoute.Sitemap {
  if (!indexable || !sitio) return [];
  const fecha = new Date();
  return [
    ...rutas.map((ruta, indice) => ({ url: `${sitio}${ruta}`, lastModified: fecha, changeFrequency: indice === 0 ? "weekly" as const : "monthly" as const, priority: indice === 0 ? 1 : 0.7 })),
    ...DEPARTAMENTOS.map((d) => ({ url: `${sitio}/departamentos/${d.slug}`, lastModified: fecha, changeFrequency: "monthly" as const, priority: 0.8 })),
    ...SECTORES.map((s) => ({ url: `${sitio}/sectores/${s.slug}`, lastModified: fecha, changeFrequency: "monthly" as const, priority: 0.7 })),
  ];
}
