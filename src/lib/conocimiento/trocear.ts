/**
 * Trocea un texto en fragmentos de ~`objetivo` caracteres con solapamiento: respeta párrafos y frases y solo corta una frase
 * si ella sola no cabe. Cada fragmento empieza con la cola del anterior (`solape`), para que una idea cortada en el límite
 * aparezca entera en alguno de los dos.
 */
export const OBJETIVO_FRAGMENTO = 1000;
export const SOLAPE_FRAGMENTO = 150;

/** Espacios y saltos de línea normalizados (sin tocar el contenido). */
export function normalizarTexto(t: string): string {
  return t.replace(/\r\n?/g, "\n").replace(/[ \t\f\v ]+/g, " ").replace(/ ?\n ?/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

type Unidad = { t: string; sep: string };

/** Parte una frase que ella sola excede el objetivo, en el último espacio que quepa. */
function partirLarga(frase: string, objetivo: number): string[] {
  const out: string[] = [];
  let resto = frase.trim();
  while (resto.length > objetivo) {
    let corte = resto.lastIndexOf(" ", objetivo);
    if (corte < objetivo * 0.5) corte = objetivo;
    out.push(resto.slice(0, corte).trim());
    resto = resto.slice(corte).trim();
  }
  if (resto) out.push(resto);
  return out;
}

/** Cola de un fragmento para solapar con el siguiente: empieza en una frase o, si no, en una palabra. "" si el fragmento es más corto que el solape. */
function cola(texto: string, solape: number): string {
  if (solape <= 0 || texto.length <= solape) return "";
  const c = texto.slice(-solape);
  const frase = c.search(/[.!?…]\s/);
  if (frase >= 0) return c.slice(frase + 1).trim();
  const espacio = c.indexOf(" ");
  return espacio >= 0 ? c.slice(espacio + 1).trim() : "";
}

export function trocear(texto: string, { objetivo = OBJETIVO_FRAGMENTO, solape = SOLAPE_FRAGMENTO }: { objetivo?: number; solape?: number } = {}): string[] {
  if (objetivo < 50 || solape < 0 || solape >= objetivo / 2) throw new Error("Parámetros de troceado no válidos.");
  const limpio = normalizarTexto(texto);
  if (!limpio) return [];

  const unidades: Unidad[] = [];
  for (const parrafo of limpio.split(/\n\n+/)) {
    if (!parrafo.trim()) continue;
    if (parrafo.length <= objetivo) {
      unidades.push({ t: parrafo.trim(), sep: "\n\n" });
      continue;
    }
    // Párrafo largo: por líneas y frases.
    let primera = true;
    for (const frase of parrafo.split(/(?<=[.!?…])\s+|\n/)) {
      for (const trozo of partirLarga(frase, objetivo)) {
        unidades.push({ t: trozo, sep: primera ? "\n\n" : " " });
        primera = false;
      }
    }
  }

  const fragmentos: string[] = [];
  let actual = "";
  for (const u of unidades) {
    if (actual && actual.length + u.sep.length + u.t.length > objetivo) {
      fragmentos.push(actual);
      let inicio = cola(actual, solape);
      // Si la cola más esta unidad se pasa mucho, se prefiere no solapar antes que hacer fragmentos enormes.
      if (inicio && inicio.length + 1 + u.t.length > objetivo + solape) inicio = "";
      actual = inicio ? `${inicio} ${u.t}` : u.t;
    } else {
      actual = actual ? actual + u.sep + u.t : u.t;
    }
  }
  if (actual) fragmentos.push(actual);
  return fragmentos;
}
