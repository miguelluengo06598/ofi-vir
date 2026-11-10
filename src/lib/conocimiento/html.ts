/** HTML → texto limpio y enlaces. Sin dependencias: es un extractor práctico para páginas de contenido, no un navegador. */

const ENTIDADES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", hellip: "…", laquo: "«", raquo: "»",
  iexcl: "¡", iquest: "¿", euro: "€", copy: "©", reg: "®", deg: "°", middot: "·", bull: "•", lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”",
  aacute: "á", eacute: "é", iacute: "í", oacute: "ó", uacute: "ú", Aacute: "Á", Eacute: "É", Iacute: "Í", Oacute: "Ó", Uacute: "Ú",
  ntilde: "ñ", Ntilde: "Ñ", uuml: "ü", Uuml: "Ü", agrave: "à", egrave: "è", ccedil: "ç", Ccedil: "Ç",
};

export function decodificarEntidades(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const n = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return n > 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff) ? String.fromCodePoint(n) : " ";
    }
    return ENTIDADES[e] ?? ENTIDADES[e.toLowerCase()] ?? m;
  });
}

/** Etiquetas cuyo contenido no es texto de la página (código, navegación, formularios…). */
const SE_QUITAN = "script|style|noscript|svg|iframe|template|head|nav|footer|aside|form|button|select|dialog|canvas|object|embed";
const BLOQUES = "p|div|section|article|main|header|ul|ol|table|thead|tbody|tfoot|tr|blockquote|pre|figure|figcaption|details|summary|dl|dt|dd|address|hr";

export function tituloDeHtml(html: string): string {
  const t = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html)?.[1] ?? "";
  return decodificarEntidades(t.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim().slice(0, 150);
}

/** Texto legible de una página: títulos con «#», listas con «-», sin menús, scripts ni estilos. */
export function htmlATextoLimpio(html: string): string {
  let h = html.replace(/<!--[\s\S]*?-->/g, " ").replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, " ");
  // Se repite por si hay etiquetas anidadas del mismo tipo (p. ej. un <nav> dentro de otro).
  for (let i = 0; i < 3; i++) h = h.replace(new RegExp(`<(${SE_QUITAN})\\b[^>]*>[\\s\\S]*?<\\/\\1\\s*>`, "gi"), " ");
  h = h.replace(new RegExp(`<(${SE_QUITAN})\\b[^>]*\\/?>`, "gi"), " ");
  h = h.replace(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1\s*>/gi, (_m, n: string, t: string) => `\n\n${"#".repeat(Number(n))} ${t.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()}\n\n`);
  h = h.replace(/<li\b[^>]*>/gi, "\n- ").replace(/<br\s*\/?>/gi, "\n");
  h = h.replace(new RegExp(`<\\/?(?:${BLOQUES})\\b[^>]*>`, "gi"), "\n").replace(/<\/(?:td|th)\s*>/gi, " | ");
  h = h.replace(/<[^>]*>/g, " ");
  return decodificarEntidades(h)
    .replace(/[ \t\f\v ]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const SIN_TEXTO = /\.(?:pdf|jpe?g|png|gif|svg|webp|avif|ico|zip|rar|gz|docx?|xlsx?|pptx?|mp[34]|avi|mov|css|js|json|xml|woff2?|ttf)$/i;
const sinWww = (h: string) => h.toLowerCase().replace(/^www\./, "");
export const mismoSitio = (a: string, b: string) => sinWww(a) === sinWww(b);

/** Enlaces http(s) del mismo sitio (sin fragmento, sin duplicados, sin archivos que no son páginas), en orden de aparición. */
export function enlacesDelMismoSitio(html: string, base: string): string[] {
  const origen = new URL(base);
  const vistos = new Set<string>([normalizarUrl(base)]);
  const out: string[] = [];
  for (const m of html.matchAll(/<a\b([^>]*)>/gi)) {
    const attrs = m[1];
    if (/\brel\s*=\s*["']?[^"'>]*nofollow/i.test(attrs)) continue;
    const href = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(attrs);
    const crudo = href ? decodificarEntidades(href[1] ?? href[2] ?? href[3] ?? "").trim() : "";
    if (!crudo || /^(?:mailto|tel|javascript|data):/i.test(crudo)) continue;
    let u: URL;
    try { u = new URL(crudo, origen); } catch { continue; }
    if ((u.protocol !== "http:" && u.protocol !== "https:") || !mismoSitio(u.hostname, origen.hostname) || SIN_TEXTO.test(u.pathname)) continue;
    const n = normalizarUrl(u.href);
    if (vistos.has(n)) continue;
    vistos.add(n);
    out.push(u.href.replace(/#.*$/, ""));
  }
  return out;
}

/** Para comparar direcciones: sin fragmento ni barra final. */
export function normalizarUrl(u: string): string {
  const x = new URL(u);
  x.hash = "";
  return x.href.replace(/\/$/, "");
}
