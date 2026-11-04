/** Utilidades de texto de la memoria: términos de búsqueda, puntuación textual y resúmenes. */

const strip = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Palabras de la consulta (sin tildes, ≥3 letras, máx. 6). Solo letras y números: seguras para filtros. */
export function queryTerms(query: string): string[] {
  const words = strip(query).match(/[a-z0-9]{3,}/g) ?? [];
  return [...new Set(words)].slice(0, 6);
}

/** 0..1: fracción de términos hallados; el título pesa el doble que el contenido. */
export function textScore(terms: string[], title: string, content: string): number {
  if (terms.length === 0) return 0;
  const t = strip(title);
  const c = strip(content);
  let score = 0;
  for (const term of terms) score += t.includes(term) ? 1 : c.includes(term) ? 0.5 : 0;
  return score / terms.length;
}

/** Una línea, recortada en el límite de una palabra. */
export function summarize(text: string, max: number): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/** Clave para detectar duplicados: sin tildes, minúsculas y espacios colapsados. */
export const normalizeKey = (s: string) => strip(s).replace(/\s+/g, " ").trim();
