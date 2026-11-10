/** Casos de uso del conocimiento: crear fuentes (web, documento, FAQ, texto), listarlas, reintentar y borrar. SOLO SERVIDOR. */
import { randomUUID } from "node:crypto";
import { comprobarUrl, ErrorDescarga } from "./descarga.ts";
import { detectarTipo, MAX_BYTES_DOCUMENTO } from "./documentos.ts";
import { procesarFuente, type DepsProcesado } from "./procesar.ts";
import { MAX_FUENTES_POR_EMPRESA, type Fuente, type PeticionJson } from "./tipos.ts";

export class ConocimientoError extends Error {
  readonly status: number;
  readonly codigo: string;
  constructor(status: number, codigo: string, mensaje: string) {
    super(mensaje);
    this.status = status;
    this.codigo = codigo;
  }
}

export type DepsConocimiento = DepsProcesado & {
  /** Ejecuta el procesado fuera de la petición (en Next, `after`). Debe empezar ya y no esperar a que termine. */
  enSegundoPlano: (trabajo: Promise<void>) => void;
  /** SOLO tests con un servidor local. */
  permitirRedLocal?: boolean;
};

export type Entorno = { companyId: string; userId: string };
const REINTENTO_ABANDONADA_MS = 15 * 60 * 1000;

const lanzar = (d: DepsConocimiento, companyId: string, id: string) => d.enSegundoPlano(procesarFuente(d, companyId, id));

async function comprobarAmbito(d: DepsConocimiento, companyId: string, agenteId: string | null | undefined): Promise<string | null> {
  if (!agenteId) return null;
  if (!(await d.almacen.agenteExiste(companyId, agenteId))) throw new ConocimientoError(404, "agente_no_encontrado", "No existe ese agente en vuestra oficina.");
  return agenteId;
}

async function comprobarCupo(d: DepsConocimiento, companyId: string) {
  if ((await d.almacen.contar(companyId)) >= MAX_FUENTES_POR_EMPRESA) {
    throw new ConocimientoError(409, "demasiadas_fuentes", `Ya hay ${MAX_FUENTES_POR_EMPRESA} fuentes de conocimiento. Borra alguna antes de añadir otra.`);
  }
}

/** Web, preguntas frecuentes o texto libre. Responde en cuanto la fuente queda guardada («procesando»); el procesado sigue en segundo plano. */
export async function crearFuenteJson(d: DepsConocimiento, e: Entorno, p: PeticionJson): Promise<Fuente> {
  const agentId = await comprobarAmbito(d, e.companyId, p.agenteId);
  await comprobarCupo(d, e.companyId);
  const id = randomUUID();
  let nueva: Parameters<typeof d.almacen.crear>[1];
  if (p.tipo === "web") {
    let url: URL;
    try { url = new URL(p.url); } catch { throw new ConocimientoError(400, "url_no_valida", "La dirección no es válida."); }
    try { comprobarUrl(url, { permitirRedLocal: d.permitirRedLocal }); } catch (err) {
      if (err instanceof ErrorDescarga) throw new ConocimientoError(400, err.codigo, err.message);
      throw err;
    }
    nueva = { id, agentId, tipo: "web", titulo: p.titulo ?? url.hostname, origen: url.href, contenido: null, storagePath: null, bytes: null, createdBy: e.userId };
  } else if (p.tipo === "texto") {
    nueva = { id, agentId, tipo: "texto", titulo: p.titulo, origen: null, contenido: p.texto, storagePath: null, bytes: Buffer.byteLength(p.texto), createdBy: e.userId };
  } else {
    const contenido = JSON.stringify(p.preguntas);
    nueva = { id, agentId, tipo: "faq", titulo: p.titulo, origen: null, contenido, storagePath: null, bytes: Buffer.byteLength(contenido), createdBy: e.userId };
  }
  const f = await d.almacen.crear(e.companyId, nueva);
  lanzar(d, e.companyId, f.id);
  return f;
}

/** Solo letras, números, punto, guion y guion bajo: el nombre va dentro de la ruta de Storage. */
export function nombreSeguro(nombre: string): string {
  const base = nombre.normalize("NFD").replace(/[̀-ͯ]/g, "").split(/[\\/]/).pop() ?? "";
  const limpio = base.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^\.+/, "").slice(-100);
  return limpio || "documento";
}

const MIME = { pdf: "application/pdf", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", txt: "text/plain" } as const;

/** Documento subido (PDF, DOCX o TXT, máx. 20 MB): se guarda en Storage en `<empresa>/<fuente>/<archivo>` y se procesa en segundo plano. */
export async function crearFuenteDocumento(
  d: DepsConocimiento,
  e: Entorno,
  a: { nombre: string; bytes: Uint8Array; titulo?: string; agenteId?: string | null },
): Promise<Fuente> {
  if (a.bytes.byteLength === 0) throw new ConocimientoError(400, "archivo_vacio", "El archivo está vacío.");
  if (a.bytes.byteLength > MAX_BYTES_DOCUMENTO) throw new ConocimientoError(413, "archivo_demasiado_grande", "El archivo supera los 20 MB.");
  const tipo = detectarTipo(a.bytes, a.nombre);
  if (!tipo) throw new ConocimientoError(415, "tipo_no_admitido", "Solo se admiten archivos PDF, DOCX y TXT (y el contenido debe coincidir con la extensión).");
  const agentId = await comprobarAmbito(d, e.companyId, a.agenteId);
  await comprobarCupo(d, e.companyId);

  const id = randomUUID();
  const nombre = nombreSeguro(a.nombre);
  const ruta = `${e.companyId}/${id}/${nombre}`;
  await d.almacen.subirArchivo(ruta, a.bytes, MIME[tipo]);
  let f: Fuente;
  try {
    f = await d.almacen.crear(e.companyId, {
      id, agentId, tipo: "documento", titulo: (a.titulo?.trim() || nombre.replace(/\.[^.]+$/, "")).slice(0, 200), origen: nombre,
      contenido: null, storagePath: ruta, bytes: a.bytes.byteLength, createdBy: e.userId,
    });
  } catch (err) {
    await d.almacen.borrarArchivo(ruta).catch(() => {});
    throw err;
  }
  lanzar(d, e.companyId, f.id);
  return f;
}

export async function listarFuentes(d: DepsConocimiento, e: Entorno, agenteId?: string | null): Promise<Fuente[]> {
  const agentId = await comprobarAmbito(d, e.companyId, agenteId);
  return d.almacen.listar(e.companyId, agentId ? { agentId } : {});
}

export async function reintentarFuente(d: DepsConocimiento, e: Entorno, id: string): Promise<Fuente> {
  if (!(await d.almacen.obtener(e.companyId, id))) throw new ConocimientoError(404, "fuente_no_encontrada", "No existe esa fuente de conocimiento.");
  const f = await d.almacen.reiniciar(e.companyId, id, REINTENTO_ABANDONADA_MS);
  if (!f) throw new ConocimientoError(409, "no_reintentable", "Solo se puede reintentar una fuente con error (o que lleve más de 15 minutos procesándose).");
  lanzar(d, e.companyId, f.id);
  return f;
}

/** Borra la fuente, TODOS sus fragmentos de la memoria y el archivo subido. */
export async function borrarFuente(d: DepsConocimiento, e: Entorno, id: string): Promise<{ borrada: true; fragmentosBorrados: number }> {
  const f = await d.almacen.borrar(e.companyId, id);
  if (!f) throw new ConocimientoError(404, "fuente_no_encontrada", "No existe esa fuente de conocimiento.");
  // La base ya los borra en cascada; esto cubre otros almacenes y los que se estén insertando justo ahora.
  const extra = await d.memoria.borrarConocimiento(e.companyId, id);
  if (f.storagePath) await d.almacen.borrarArchivo(f.storagePath).catch((err) => d.registrarError?.("No se pudo borrar el archivo de una fuente", err));
  return { borrada: true, fragmentosBorrados: Math.max(f.fragmentos, extra) };
}
