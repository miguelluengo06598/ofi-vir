/**
 * Procesado de una fuente de conocimiento (en segundo plano): texto → fragmentos con solapamiento → embeddings con el servicio de
 * memoria → nodos `conocimiento` enlazados con la fuente. Estados: procesando → listo | error.
 * Todo lo que se extrae de una web o un documento es DATO: aquí solo se trocea y se guarda; nada se interpreta ni se ejecuta.
 */
import { detectarManipulacion } from "../agents/sospechoso.ts";
import type { MemoryService } from "../memory/service.ts";
import { summarize } from "../memory/text.ts";
import { ErrorDescarga, type Descargador } from "./descarga.ts";
import { ErrorDocumento, extraerTextoDocumento } from "./documentos.ts";
import { trocear } from "./trocear.ts";
import { MAX_FRAGMENTOS_POR_FUENTE, PreguntaSchema, type AlmacenConocimiento, type Fuente } from "./tipos.ts";
import { ErrorWeb, leerWeb, type OpcionesWeb } from "./web.ts";
import { z } from "zod";

export type DepsProcesado = {
  almacen: AlmacenConocimiento;
  memoria: MemoryService;
  descargar: Descargador;
  opcionesWeb?: OpcionesWeb;
  /** Para registrar errores inesperados (sin datos de la empresa). */
  registrarError?: (mensaje: string, e: unknown) => void;
};

type Pieza = { titulo: string; contenido: string };

const TITULO_MAX = 190;
const MENSAJE_GENERICO = "No se pudo procesar la fuente. Inténtalo de nuevo; si sigue fallando, avisa a soporte.";

function conParte(titulo: string, i: number, n: number): string {
  return n > 1 ? `${summarize(titulo, TITULO_MAX - 20)} (parte ${i + 1}/${n})` : summarize(titulo, TITULO_MAX);
}

function piezasDeTexto(titulo: string, texto: string, prefijo = ""): Pieza[] {
  const trozos = trocear(texto);
  return trozos.map((t, i) => ({ titulo: conParte(titulo, i, trozos.length), contenido: prefijo ? `${prefijo}\n${t}` : t }));
}

function piezasDeFaq(contenido: string): Pieza[] {
  let pares: z.infer<typeof PreguntaSchema>[];
  try {
    pares = z.array(PreguntaSchema).parse(JSON.parse(contenido));
  } catch {
    throw new ErrorDocumento("Las preguntas frecuentes guardadas no son válidas.");
  }
  return pares.flatMap((p) => {
    const entero = `Pregunta: ${p.pregunta}\nRespuesta: ${p.respuesta}`;
    if (entero.length <= 1800) return [{ titulo: summarize(p.pregunta, TITULO_MAX), contenido: entero }];
    // Respuesta larga: se trocea, repitiendo la pregunta en cada trozo para que cada uno se entienda solo.
    const trozos = trocear(p.respuesta, { objetivo: 1200, solape: 150 });
    return trozos.map((t, i) => ({ titulo: conParte(p.pregunta, i, trozos.length), contenido: `Pregunta: ${p.pregunta}\nRespuesta: ${t}` }));
  });
}

async function construirPiezas(f: Fuente, d: DepsProcesado): Promise<{ piezas: Pieza[]; paginas: number; avisos: string[] }> {
  switch (f.tipo) {
    case "texto":
      return { piezas: piezasDeTexto(f.titulo, f.contenido ?? ""), paginas: 0, avisos: [] };
    case "faq":
      return { piezas: piezasDeFaq(f.contenido ?? "[]"), paginas: 0, avisos: [] };
    case "documento": {
      if (!f.storagePath) throw new ErrorDocumento("No se encuentra el archivo subido.");
      const bytes = await d.almacen.leerArchivo(f.storagePath);
      if (!bytes) throw new ErrorDocumento("No se encuentra el archivo subido.");
      const r = await extraerTextoDocumento(bytes, f.origen ?? "documento.txt");
      return { piezas: piezasDeTexto(f.titulo, r.texto), paginas: r.paginas ?? 0, avisos: [] };
    }
    case "web": {
      const r = await leerWeb(f.origen ?? "", d.descargar, d.opcionesWeb);
      const piezas = r.paginas.flatMap((p) => piezasDeTexto(p.titulo || f.titulo, p.texto, `Fuente: ${p.url}`));
      return { piezas, paginas: r.paginas.length, avisos: r.avisos };
    }
  }
}

/** Mensaje seguro (en español) que ve la empresa si algo falla. Lo que no es de los nuestros no se enseña. */
function mensajeSeguro(e: unknown): string | null {
  if (e instanceof ErrorWeb || e instanceof ErrorDocumento || e instanceof ErrorDescarga) return e.message;
  if (e instanceof Error && /embedder|VOYAGE/i.test(e.message)) return "El servicio de búsqueda por significado no está disponible ahora mismo. Inténtalo más tarde.";
  return null;
}

/**
 * Procesa una fuente que esté en «procesando». Nunca lanza: deja la fuente en `listo` o `error`.
 * Si la fuente se borra mientras se procesa, no deja fragmentos huérfanos.
 */
export async function procesarFuente(d: DepsProcesado, companyId: string, id: string): Promise<void> {
  const f = await d.almacen.obtener(companyId, id);
  if (!f || f.estado !== "procesando") return;
  try {
    const { piezas, paginas, avisos } = await construirPiezas(f, d);
    if (piezas.length === 0) throw new ErrorDocumento("No se encontró texto que guardar.");
    if (piezas.length > MAX_FRAGMENTOS_POR_FUENTE) {
      throw new ErrorDocumento(`Hay demasiado contenido (${piezas.length} fragmentos; el máximo es ${MAX_FRAGMENTOS_POR_FUENTE}). Divídelo en varias fuentes.`);
    }
    // Si el texto trae órdenes para un agente, se guarda igual (es información) pero se avisa a la empresa y, al leerlo, la tarea queda en revisión.
    const motivos = new Set<string>();
    let sospechosos = 0;
    for (const p of piezas) {
      const m = detectarManipulacion(p.contenido);
      if (m.length) { sospechosos++; m.forEach((x) => motivos.add(x)); }
    }
    const todos = [...avisos];
    if (sospechosos > 0) {
      todos.push(`${sospechosos} fragmento(s) contienen texto que intenta dar órdenes a un agente (${[...motivos].join("; ")}). Se guardan como simple información y los agentes nunca las obedecen, pero conviene revisar el origen.`);
    }

    // Un reintento parte de cero: se quita lo que dejara un intento anterior.
    await d.memoria.borrarConocimiento(companyId, id);
    await d.memoria.guardarConocimiento(companyId, { knowledgeId: id, ambitoAgentId: f.agentId, createdByUserId: f.createdBy ?? null }, piezas);
    const ok = await d.almacen.terminar(companyId, id, { estado: "listo", fragmentos: piezas.length, paginas, avisos: todos });
    // La fuente se borró (o la reiniciaron) mientras se procesaba: no deben quedar fragmentos de ella.
    if (!ok) await d.memoria.borrarConocimiento(companyId, id);
  } catch (e) {
    if (e instanceof Error && e.message === "FUENTE_BORRADA") return;
    const seguro = mensajeSeguro(e);
    if (!seguro) d.registrarError?.(`Error procesando la fuente de conocimiento ${id}`, e);
    // Limpiar y marcar el error son dos pasos independientes: que falle el primero no debe dejar la fuente «procesando» para siempre.
    await d.memoria.borrarConocimiento(companyId, id).catch((e2) => d.registrarError?.(`No se pudieron limpiar los fragmentos de ${id}`, e2));
    await d.almacen.terminar(companyId, id, { estado: "error", error: seguro ?? MENSAJE_GENERICO }).catch((e2) => d.registrarError?.(`No se pudo marcar el error de la fuente ${id}`, e2));
  }
}
