/** Extracción de texto de documentos subidos (PDF, DOCX, TXT), en el servidor. El tipo se decide por el CONTENIDO, no solo por el nombre. */

export const MAX_BYTES_DOCUMENTO = 20 * 1024 * 1024;
/** Tope de texto extraído (caracteres): evita que un documento enorme o una «bomba» llene la memoria. */
export const MAX_CARACTERES_TEXTO = 1_500_000;
/** Un DOCX es un ZIP: si descomprimido pesa más que esto, se rechaza (bomba de compresión). */
const MAX_DESCOMPRIMIDO = 150 * 1024 * 1024;

export class ErrorDocumento extends Error {}

export type TipoDocumento = "pdf" | "docx" | "txt";

export function detectarTipo(bytes: Uint8Array, nombre: string): TipoDocumento | null {
  const ext = nombre.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
  const empieza = (s: string) => s.split("").every((c, i) => bytes[i] === c.charCodeAt(0));
  if (empieza("%PDF-")) return ext === "pdf" || ext === undefined ? "pdf" : null;
  if (bytes[0] === 0x50 && bytes[1] === 0x4b && (bytes[2] === 0x03 || bytes[2] === 0x05)) return ext === "docx" ? "docx" : null;
  return ext === "txt" || ext === "text" ? "txt" : null;
}

/** Suma de los tamaños descomprimidos según el directorio central del ZIP (sin descomprimir nada). */
export function tamanoDescomprimidoZip(b: Uint8Array): number {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let eocd = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 65_557); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new ErrorDocumento("El archivo DOCX está dañado.");
  const n = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  let total = 0;
  for (let i = 0; i < n; i++) {
    if (p + 46 > b.length || dv.getUint32(p, true) !== 0x02014b50) throw new ErrorDocumento("El archivo DOCX está dañado.");
    total += dv.getUint32(p + 24, true);
    p += 46 + dv.getUint16(p + 28, true) + dv.getUint16(p + 30, true) + dv.getUint16(p + 32, true);
  }
  return total;
}

function textoPlano(bytes: Uint8Array): string {
  let t: string;
  try {
    t = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    t = new TextDecoder("windows-1252").decode(bytes);
  }
  t = t.replace(/^﻿/, "");
  const control = (t.match(/[\u0000-\u0008\u000E-\u001F]/g) ?? []).length;
  if (control > Math.max(5, t.length * 0.01)) throw new ErrorDocumento("El archivo no parece un texto (tiene datos binarios).");
  return t;
}

export type ExtraidoDocumento = { texto: string; paginas: number | null; tipo: TipoDocumento };

export async function extraerTextoDocumento(bytes: Uint8Array, nombre: string): Promise<ExtraidoDocumento> {
  if (bytes.byteLength === 0) throw new ErrorDocumento("El archivo está vacío.");
  if (bytes.byteLength > MAX_BYTES_DOCUMENTO) throw new ErrorDocumento("El archivo supera los 20 MB.");
  const tipo = detectarTipo(bytes, nombre);
  if (!tipo) throw new ErrorDocumento("Solo se admiten archivos PDF, DOCX y TXT (y el contenido debe coincidir con la extensión).");

  let texto: string;
  let paginas: number | null = null;
  if (tipo === "txt") {
    texto = textoPlano(bytes);
  } else if (tipo === "pdf") {
    try {
      const { extractText, getDocumentProxy } = await import("unpdf");
      const pdf = await getDocumentProxy(new Uint8Array(bytes));
      const r = await extractText(pdf, { mergePages: true });
      texto = Array.isArray(r.text) ? r.text.join("\n\n") : r.text;
      paginas = r.totalPages;
    } catch (e) {
      const m = e instanceof Error ? e.message : "";
      if (/password/i.test(m)) throw new ErrorDocumento("El PDF está protegido con contraseña.");
      throw new ErrorDocumento("No se pudo leer el PDF (¿está dañado?).");
    }
    if (texto.replace(/\s/g, "").length < 20) throw new ErrorDocumento("El PDF no contiene texto que se pueda leer (¿es un escaneado?).");
  } else {
    if (tamanoDescomprimidoZip(bytes) > MAX_DESCOMPRIMIDO) throw new ErrorDocumento("El documento descomprimido es demasiado grande.");
    try {
      const mammoth = (await import("mammoth")).default;
      texto = (await mammoth.extractRawText({ buffer: Buffer.from(bytes) })).value;
    } catch {
      throw new ErrorDocumento("No se pudo leer el DOCX (¿está dañado?).");
    }
    if (texto.trim().length < 1) throw new ErrorDocumento("El documento no contiene texto.");
  }
  if (texto.length > MAX_CARACTERES_TEXTO) throw new ErrorDocumento("El documento tiene demasiado texto (máximo 1,5 millones de caracteres).");
  return { texto, paginas, tipo };
}

