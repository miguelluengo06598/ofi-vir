/** Archivos y servidor de prueba para los tests y la demo (no se usa en producción). */
import http from "node:http";
import type { AddressInfo } from "node:net";

/** PDF mínimo y válido con una página de texto (Helvetica, WinAnsi → admite tildes y ñ). */
export function crearPdf(lineas: string[]): Uint8Array {
  const esc = (s: string) => s.replace(/[\\()]/g, (m) => `\\${m}`);
  const contenido = `BT /F1 11 Tf 14 TL 50 750 Td ${lineas.map((l) => `(${esc(l)}) Tj T*`).join(" ")} ET`;
  const objetos = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${Buffer.byteLength(contenido, "latin1")} >>\nstream\n${contenido}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
  ];
  let pdf = "%PDF-1.4\n";
  const posiciones: number[] = [];
  objetos.forEach((o, i) => {
    posiciones.push(Buffer.byteLength(pdf, "latin1"));
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n${posiciones.map((p) => `${String(p).padStart(10, "0")} 00000 n \n`).join("")}`;
  pdf += `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new Uint8Array(Buffer.from(pdf, "latin1"));
}

const TABLA_CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (b: Uint8Array) => {
  let c = 0xffffffff;
  for (const x of b) c = TABLA_CRC[(c ^ x) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

/** ZIP sin comprimir (método «stored»). `tamanoFalso` declara otro tamaño descomprimido (para probar la defensa contra bombas). */
export function crearZip(archivos: Record<string, string>, tamanoFalso?: number): Uint8Array {
  const locales: Buffer[] = [];
  const centrales: Buffer[] = [];
  let desplazamiento = 0;
  for (const [nombre, texto] of Object.entries(archivos)) {
    const n = Buffer.from(nombre);
    const d = Buffer.from(texto);
    const crc = crc32(d);
    const l = Buffer.alloc(30);
    l.writeUInt32LE(0x04034b50, 0); l.writeUInt16LE(20, 4); l.writeUInt32LE(crc, 14); l.writeUInt32LE(d.length, 18); l.writeUInt32LE(d.length, 22); l.writeUInt16LE(n.length, 26);
    locales.push(l, n, d);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt32LE(crc, 16); c.writeUInt32LE(d.length, 20);
    c.writeUInt32LE(tamanoFalso ?? d.length, 24); c.writeUInt16LE(n.length, 28); c.writeUInt32LE(desplazamiento, 42);
    centrales.push(c, n);
    desplazamiento += 30 + n.length + d.length;
  }
  const dirCentral = Buffer.concat(centrales);
  const fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0); fin.writeUInt16LE(Object.keys(archivos).length, 8); fin.writeUInt16LE(Object.keys(archivos).length, 10);
  fin.writeUInt32LE(dirCentral.length, 12); fin.writeUInt32LE(desplazamiento, 16);
  return new Uint8Array(Buffer.concat([...locales, dirCentral, fin]));
}

const xmlEsc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** DOCX mínimo con un párrafo por línea. */
export function crearDocx(parrafos: string[], tamanoFalso?: number): Uint8Array {
  return crearZip(
    {
      "[Content_Types].xml": '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
      "_rels/.rels": '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
      "word/document.xml": `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${parrafos.map((p) => `<w:p><w:r><w:t>${xmlEsc(p)}</w:t></w:r></w:p>`).join("")}</w:body></w:document>`,
    },
    tamanoFalso,
  );
}

export type Pagina = { status?: number; tipo?: string; cuerpo?: string; cabeceras?: Record<string, string>; retrasoMs?: number };
export type WebDePrueba = { url: string; cerrar: () => Promise<void>; visitas: string[]; paginas: Map<string, Pagina> };

/** Servidor web local con las páginas que se le indiquen. `visitas` registra cada ruta pedida (robots.txt incluido). */
export async function levantarWeb(paginas: Record<string, Pagina | string>): Promise<WebDePrueba> {
  const mapa = new Map<string, Pagina>(Object.entries(paginas).map(([k, v]) => [k, typeof v === "string" ? { cuerpo: v } : v]));
  const visitas: string[] = [];
  const servidor = http.createServer((req, res) => {
    const ruta = new URL(req.url ?? "/", "http://x").pathname;
    visitas.push(ruta);
    const p = mapa.get(ruta);
    if (!p) { res.writeHead(404, { "content-type": "text/plain" }); return res.end("no existe"); }
    const enviar = () => {
      res.writeHead(p.status ?? 200, { "content-type": p.tipo ?? (ruta === "/robots.txt" ? "text/plain" : "text/html; charset=utf-8"), ...p.cabeceras });
      res.end(p.cuerpo ?? "");
    };
    if (p.retrasoMs) setTimeout(enviar, p.retrasoMs); else enviar();
  });
  await new Promise<void>((r) => servidor.listen(0, "127.0.0.1", r));
  const { port } = servidor.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    visitas,
    paginas: mapa,
    cerrar: () => new Promise<void>((r) => { servidor.closeAllConnections(); servidor.close(() => r()); }),
  };
}

/** Página HTML sencilla con menú, pie, scripts y estilos que NO deben acabar en el conocimiento. */
export const pagina = (titulo: string, cuerpo: string, enlaces: string[] = []) =>
  `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${titulo}</title><style>body{color:red}</style><script>var x="no me copies";</script></head>
<body><nav><a href="/">Inicio</a> Menú de navegación que no es contenido</nav><main><h1>${titulo}</h1>${cuerpo}</main>
${enlaces.map((e) => `<a href="${e}">enlace</a>`).join("\n")}<footer>Aviso legal y cookies © 2026</footer></body></html>`;
