/**
 * Rutas /api/conocimiento. SOLO SERVIDOR. Las rutas de Next.js son un envoltorio fino sobre estos manejadores.
 *  - La empresa sale SIEMPRE de la sesión; los cuerpos JSON se validan con zod en modo estricto (un `companyId` se rechaza).
 *  - Añadir, reintentar y borrar: solo propietarios y administradores. Leer: cualquier miembro.
 *  - Un agente o una fuente de otra empresa responde 404, igual que uno que no existe.
 */
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { autenticadorSupabase, type Sesion } from "../creditos/api.ts";
import { createMemoryService } from "../memory/service.ts";
import { embedderFromEnv } from "../memory/embedderFromEnv.ts";
import { SupabaseMemoryStore } from "../memory/supabaseStore.ts";
import { crearDescargador } from "./descarga.ts";
import { MAX_BYTES_DOCUMENTO } from "./documentos.ts";
import {
  borrarFuente, ConocimientoError, crearFuenteDocumento, crearFuenteJson, listarFuentes, reintentarFuente, type DepsConocimiento,
} from "./servicio.ts";
import { SupabaseAlmacenConocimiento } from "./supabaseAlmacen.ts";
import { PeticionJsonSchema, type Fuente } from "./tipos.ts";
import { AGENTE_WEB } from "./web.ts";

export type DepsApiConocimiento = { deps: DepsConocimiento; autenticar: (req: Request) => Promise<Sesion | null> };

const json = (cuerpo: unknown, status = 200) => Response.json(cuerpo, { status, headers: { "cache-control": "no-store" } });
const fallo = (status: number, error: string, mensaje: string, extra: Record<string, unknown> = {}) => json({ error, mensaje, ...extra }, status);

/** Lo que ve la empresa de una fuente: nunca el texto guardado ni la ruta interna del archivo. */
export const fuentePublica = (f: Fuente) => ({
  id: f.id, agenteId: f.agentId, tipo: f.tipo, titulo: f.titulo, origen: f.origen, estado: f.estado, error: f.error,
  fragmentos: f.fragmentos, paginas: f.paginas, bytes: f.bytes, avisos: f.avisos, creadoEn: f.creadoEn, procesadoEn: f.procesadoEn,
});

async function entrar(req: Request, api: DepsApiConocimiento, escritura: boolean): Promise<{ res: Response } | { sesion: Sesion }> {
  const sesion = await api.autenticar(req);
  if (!sesion) return { res: fallo(401, "no_autenticado", "Inicia sesión para continuar.") };
  if (escritura && sesion.rol !== "owner" && sesion.rol !== "admin") {
    return { res: fallo(403, "sin_permiso", "Solo los propietarios y administradores pueden gestionar el conocimiento de los agentes.") };
  }
  return { sesion };
}

function responderError(e: unknown, api: DepsApiConocimiento): Response {
  if (e instanceof ConocimientoError) return fallo(e.status, e.codigo, e.message);
  api.deps.registrarError?.("Error en el conocimiento", e);
  return fallo(500, "error_interno", "No se pudo completar la operación.");
}

const idValido = (id: string) => z.uuid().safeParse(id).success;
const sinFuente = () => fallo(404, "fuente_no_encontrada", "No existe esa fuente de conocimiento.");

/** POST /api/conocimiento — JSON `{ tipo: "web"|"faq"|"texto", … }` o `multipart/form-data` con `archivo` (PDF, DOCX o TXT). Responde 202: se procesa en segundo plano. */
export async function crearHandler(req: Request, api: DepsApiConocimiento): Promise<Response> {
  const entrada = await entrar(req, api, true);
  if ("res" in entrada) return entrada.res;
  const { sesion } = entrada;
  const tipoCuerpo = req.headers.get("content-type") ?? "";
  try {
    if (/^multipart\/form-data/i.test(tipoCuerpo)) {
      // Se corta antes de leer el cuerpo si ya anuncia más de 20 MB (más un margen para el resto del formulario).
      const largo = Number(req.headers.get("content-length"));
      if (Number.isFinite(largo) && largo > MAX_BYTES_DOCUMENTO + 1024 * 1024) return fallo(413, "archivo_demasiado_grande", "El archivo supera los 20 MB.");
      let form: FormData;
      try { form = await req.formData(); } catch { return fallo(400, "formulario_invalido", "El formulario no es válido."); }
      const archivo = form.get("archivo");
      if (!(archivo instanceof File)) return fallo(400, "peticion_invalida", "Falta el archivo (campo «archivo»).");
      const extras = [...form.keys()].filter((k) => !["archivo", "titulo", "agenteId"].includes(k));
      if (extras.length) return fallo(400, "peticion_invalida", `Campos no permitidos: ${extras.join(", ")}.`);
      const titulo = form.get("titulo");
      const agenteId = form.get("agenteId");
      if (typeof agenteId === "string" && agenteId !== "" && !idValido(agenteId)) return fallo(404, "agente_no_encontrado", "No existe ese agente en vuestra oficina.");
      const f = await crearFuenteDocumento(api.deps, { companyId: sesion.companyId, userId: sesion.userId }, {
        nombre: archivo.name, bytes: new Uint8Array(await archivo.arrayBuffer()),
        titulo: typeof titulo === "string" ? titulo.slice(0, 200) : undefined, agenteId: typeof agenteId === "string" && agenteId ? agenteId : null,
      });
      return json({ fuente: fuentePublica(f) }, 202);
    }
    let datos: unknown;
    try { datos = JSON.parse((await req.text()) || "{}"); } catch { return fallo(400, "json_invalido", "El cuerpo no es un JSON válido."); }
    const v = PeticionJsonSchema.safeParse(datos);
    if (!v.success) return fallo(400, "peticion_invalida", "La petición no es válida.", { incidencias: v.error.issues.map((i) => ({ campo: i.path.join(".") || null, mensaje: i.message })) });
    const f = await crearFuenteJson(api.deps, { companyId: sesion.companyId, userId: sesion.userId }, v.data);
    return json({ fuente: fuentePublica(f) }, 202);
  } catch (e) {
    return responderError(e, api);
  }
}

/** GET /api/conocimiento?agenteId= — fuentes de la oficina y, con `agenteId`, las de ese agente. */
export async function listarHandler(req: Request, api: DepsApiConocimiento): Promise<Response> {
  const entrada = await entrar(req, api, false);
  if ("res" in entrada) return entrada.res;
  const agenteId = new URL(req.url).searchParams.get("agenteId");
  if (agenteId !== null && !idValido(agenteId)) return fallo(404, "agente_no_encontrado", "No existe ese agente en vuestra oficina.");
  try {
    const fuentes = await listarFuentes(api.deps, { companyId: entrada.sesion.companyId, userId: entrada.sesion.userId }, agenteId);
    return json({ fuentes: fuentes.map(fuentePublica) });
  } catch (e) {
    return responderError(e, api);
  }
}

/** DELETE /api/conocimiento/[id] — borra la fuente, todos sus fragmentos y el archivo. */
export async function borrarHandler(req: Request, id: string, api: DepsApiConocimiento): Promise<Response> {
  const entrada = await entrar(req, api, true);
  if ("res" in entrada) return entrada.res;
  if (!idValido(id)) return sinFuente();
  try {
    return json(await borrarFuente(api.deps, { companyId: entrada.sesion.companyId, userId: entrada.sesion.userId }, id));
  } catch (e) {
    return responderError(e, api);
  }
}

/** POST /api/conocimiento/[id]/reintentar — vuelve a procesar una fuente con error. */
export async function reintentarHandler(req: Request, id: string, api: DepsApiConocimiento): Promise<Response> {
  const entrada = await entrar(req, api, true);
  if ("res" in entrada) return entrada.res;
  if (!idValido(id)) return sinFuente();
  try {
    const f = await reintentarFuente(api.deps, { companyId: entrada.sesion.companyId, userId: entrada.sesion.userId }, id);
    return json({ fuente: fuentePublica(f) }, 202);
  } catch (e) {
    return responderError(e, api);
  }
}

/** Dependencias a partir del entorno. `enSegundoPlano` lo aporta la ruta (`after` de Next). null si falta la base. */
export function depsConocimientoDesdeEntorno(
  enSegundoPlano: (trabajo: Promise<void>) => void,
  env: Record<string, string | undefined> = process.env,
): DepsApiConocimiento | null {
  const url = env.NEXT_PUBLIC_SUPABASE_URL, key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  const db = createClient(url, key, { auth: { persistSession: false } });
  const store = new SupabaseMemoryStore(db);
  return {
    autenticar: autenticadorSupabase(db, env),
    deps: {
      almacen: new SupabaseAlmacenConocimiento(db),
      memoria: createMemoryService({ store, embedder: embedderFromEnv() }),
      descargar: crearDescargador({ userAgent: AGENTE_WEB, timeoutMs: 10_000, maxBytes: 2 * 1024 * 1024 }),
      enSegundoPlano,
      registrarError: (m, e) => console.error(m, e instanceof Error ? e.message : e),
    },
  };
}
