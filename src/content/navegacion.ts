/**
 * Mapa de la web pública: menú, pie y recorrido (anterior / siguiente) salen de aquí.
 * El recorrido permite leer la web como una historia, de la portada a «Solicitar acceso».
 */
import { DEPARTAMENTOS } from "./departamentos";
import { SECTORES } from "./sectores";

export type EnlaceNav = { href: string; label: string; mega?: "departamentos" | "sectores" };

export const MENU: EnlaceNav[] = [
  { href: "/producto", label: "Producto" },
  { href: "/departamentos", label: "Departamentos", mega: "departamentos" },
  { href: "/equipo-conectado", label: "Equipo conectado" },
  { href: "/como-empezar", label: "Cómo empezar" },
  { href: "/seguridad", label: "Seguridad" },
  { href: "/sectores", label: "Sectores", mega: "sectores" },
  { href: "/precios", label: "Precios" },
];

export const LEGALES = [
  { href: "/aviso-legal", label: "Aviso legal" },
  { href: "/privacidad", label: "Privacidad" },
  { href: "/cookies", label: "Cookies" },
  { href: "/condiciones", label: "Condiciones" },
] as const;

type Paso = { href: string; label: string };

/** Orden de lectura: cada sección enlaza con la anterior y la siguiente. */
const RECORRIDO: Paso[] = [
  { href: "/", label: "Inicio" },
  { href: "/producto", label: "Producto" },
  { href: "/departamentos", label: "Departamentos" },
  ...DEPARTAMENTOS.map((d) => ({ href: `/departamentos/${d.slug}`, label: d.nombre })),
  { href: "/equipo-conectado", label: "Equipo conectado" },
  { href: "/como-empezar", label: "Cómo empezar" },
  { href: "/seguridad", label: "Seguridad" },
  { href: "/sectores", label: "Sectores" },
  ...SECTORES.map((s) => ({ href: `/sectores/${s.slug}`, label: s.nombre })),
  { href: "/precios", label: "Precios" },
  { href: "/solicitar-acceso", label: "Solicitar acceso" },
];

export function vecinos(ruta: string): { anterior?: Paso; siguiente?: Paso } {
  const i = RECORRIDO.findIndex((p) => p.href === ruta);
  if (i < 0) return {};
  return { anterior: RECORRIDO[i - 1], siguiente: RECORRIDO[i + 1] };
}

/** ¿Está activa esta entrada del menú? (también en sus subpáginas). */
export const esActual = (ruta: string, href: string) => ruta === href || ruta.startsWith(`${href}/`);
