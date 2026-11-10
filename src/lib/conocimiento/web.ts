/**
 * Lee una web para el conocimiento: la página indicada y, como máximo, `maxPaginas` páginas del MISMO sitio enlazadas desde ella.
 * Respeta robots.txt (si lo prohíbe, no se descarga nada), un tiempo total máximo y descarga de una en una.
 */
import { enlacesDelMismoSitio, htmlATextoLimpio, normalizarUrl, tituloDeHtml } from "./html.ts";
import { ErrorDescarga, type Descargador } from "./descarga.ts";
import { PERMITE_TODO, PROHIBE_TODO, parsearRobots, type Robots } from "./robots.ts";

export const AGENTE_WEB = "OficinaVirtualBot/1.0";
export const MAX_PAGINAS_ENLAZADAS = 20;

export class ErrorWeb extends Error {}

export type PaginaLeida = { url: string; titulo: string; texto: string };
export type ResultadoWeb = { paginas: PaginaLeida[]; avisos: string[] };

export type OpcionesWeb = {
  maxPaginasEnlazadas?: number;
  /** Tiempo total de la lectura (ms). */
  timeoutTotalMs?: number;
  /** Pausa entre páginas cuando robots.txt pide `Crawl-delay` (se limita a 3 s). */
  esperar?: (ms: number) => Promise<void>;
  ahora?: () => number;
  agente?: string;
};

const TEXTO_MINIMO = 80;

export async function leerWeb(urlInicial: string, descargar: Descargador, o: OpcionesWeb = {}): Promise<ResultadoWeb> {
  const max = Math.min(o.maxPaginasEnlazadas ?? MAX_PAGINAS_ENLAZADAS, MAX_PAGINAS_ENLAZADAS);
  const ahora = o.ahora ?? Date.now;
  const esperar = o.esperar ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const limite = ahora() + (o.timeoutTotalMs ?? 90_000);
  const avisos: string[] = [];

  let raiz: URL;
  try { raiz = new URL(urlInicial); } catch { throw new ErrorWeb("La dirección no es válida."); }
  if (raiz.protocol !== "http:" && raiz.protocol !== "https:") throw new ErrorWeb("Solo se admiten direcciones http o https.");

  // robots.txt: 4xx = sin restricciones; 5xx o error de red = no se puede comprobar, así que no se descarga (RFC 9309).
  let robots: Robots;
  try {
    const r = await descargar(new URL("/robots.txt", raiz).href, { sitio: raiz.hostname });
    robots = r.status >= 200 && r.status < 300 ? parsearRobots(r.texto, o.agente ?? AGENTE_WEB) : r.status >= 500 ? PROHIBE_TODO : PERMITE_TODO;
    if (robots === PROHIBE_TODO) throw new ErrorWeb("No se pudo comprobar el robots.txt de la web (error del servidor), así que no se lee.");
  } catch (e) {
    if (e instanceof ErrorWeb) throw e;
    if (e instanceof ErrorDescarga && (e.codigo === "direccion_no_permitida" || e.codigo === "url_no_valida")) throw new ErrorWeb(e.message);
    throw new ErrorWeb("No se pudo comprobar el robots.txt de la web, así que no se lee.");
  }
  const permitida = (u: string) => { const x = new URL(u); return robots.permite(x.pathname + x.search); };
  if (!permitida(raiz.href)) throw new ErrorWeb("El robots.txt de esa web no permite leer esa página.");
  const pausa = Math.min((robots.retrasoSegundos ?? 0) * 1000, 3000);

  const paginas: PaginaLeida[] = [];
  const vistas = new Set<string>();
  const textos = new Set<string>();
  const cola: string[] = [raiz.href];
  let enlazadas = 0;
  let primera = true;
  let omitidasPorRobots = 0;

  while (cola.length > 0) {
    if (ahora() > limite) { avisos.push(`Se alcanzó el tiempo máximo: se leyeron ${paginas.length} página(s) y el resto no.`); break; }
    const url = cola.shift()!;
    const clave = normalizarUrl(url);
    if (vistas.has(clave)) continue;
    vistas.add(clave);
    if (!primera && pausa > 0) await esperar(pausa);
    try {
      const r = await descargar(url, { sitio: raiz.hostname });
      if (r.status < 200 || r.status >= 300) throw new ErrorWeb(`respondió ${r.status}`);
      // Una redirección dentro del sitio puede llevar a una ruta que robots.txt prohíbe.
      if (!permitida(r.url)) { omitidasPorRobots++; if (primera) throw new ErrorWeb("El robots.txt de esa web no permite leer esa página."); continue; }
      const esHtml = /html/i.test(r.tipo) || /<html|<body|<p[ >]/i.test(r.texto.slice(0, 2000));
      const texto = esHtml ? htmlATextoLimpio(r.texto) : r.texto.replace(/\s+\n/g, "\n").trim();
      const titulo = (esHtml ? tituloDeHtml(r.texto) : "") || new URL(r.url).pathname;
      if (esHtml && primera) for (const e of enlacesDelMismoSitio(r.texto, r.url)) { if (cola.length < max && permitidaSiEsNueva(e)) cola.push(e); }
      if (texto.length >= TEXTO_MINIMO && !textos.has(texto)) {
        textos.add(texto);
        paginas.push({ url: r.url, titulo, texto });
      }
      if (!primera) enlazadas++;
    } catch (e) {
      const motivo = e instanceof ErrorDescarga || e instanceof ErrorWeb ? e.message : "error desconocido";
      if (primera) throw new ErrorWeb(`No se pudo leer la página: ${motivo}.`);
      avisos.push(`No se pudo leer ${url}: ${motivo}.`);
    }
    primera = false;
  }
  void enlazadas;

  function permitidaSiEsNueva(u: string) {
    if (permitida(u)) return true;
    omitidasPorRobots++;
    return false;
  }
  if (omitidasPorRobots > 0) avisos.push(`${omitidasPorRobots} página(s) enlazada(s) no se leyeron porque robots.txt no lo permite.`);
  if (paginas.length === 0) throw new ErrorWeb("La página no tiene texto que se pueda leer (puede cargarse con JavaScript).");
  return { paginas, avisos };
}
