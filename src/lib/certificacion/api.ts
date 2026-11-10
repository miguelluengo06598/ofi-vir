/**
 * POST /api/agentes/[id]/certificar y GET /api/agentes/[id]/certificacion. SOLO SERVIDOR; las rutas de Next.js son un envoltorio fino.
 *  - La empresa sale SIEMPRE de la sesión; cuerpo con zod estricto. Enviar: solo propietarios y administradores. Leer el informe: cualquier miembro.
 *  - El informe es el de la empresa: bloques, casos fallidos y sugerencias. Nunca las instrucciones base ni los casos completos.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { autenticadorSupabase, type Sesion } from "../creditos/api.ts";
import { depsExamenDesdeEntorno } from "./entorno.ts";
import { ejecutarExamen, type DepsExamen } from "./examen.ts";
import { CertificacionError, enviarACertificacion } from "./solicitudes.ts";

export type DepsApiCertificacion = {
  db: SupabaseClient;
  autenticar: (req: Request) => Promise<Sesion | null>;
  /** Lanza el examen en segundo plano (en Next, `after`). Sin él (o sin motor), la solicitud queda `pendiente_examen` para la tarea periódica. */
  examen?: DepsExamen | null;
  enSegundoPlano?: (p: Promise<unknown>) => void;
};

const PeticionSchema = z.object({ resumen: z.string().trim().min(1).max(500).optional(), activarAlAprobar: z.boolean().optional() }).strict();
const json = (cuerpo: unknown, status = 200) => Response.json(cuerpo, { status, headers: { "cache-control": "no-store" } });
const fallo = (status: number, error: string, mensaje: string, extra: Record<string, unknown> = {}) => json({ error, mensaje, ...extra }, status);

export async function certificarHandler(req: Request, idAgente: string, api: DepsApiCertificacion): Promise<Response> {
  const sesion = await api.autenticar(req);
  if (!sesion) return fallo(401, "no_autenticado", "Inicia sesión para continuar.");
  if (sesion.rol !== "owner" && sesion.rol !== "admin") return fallo(403, "sin_permiso", "Solo los propietarios y administradores pueden enviar un agente a certificación.");
  if (!z.uuid().safeParse(idAgente).success) return fallo(404, "agente_no_encontrado", "No existe ese agente en vuestra oficina.");
  let cuerpo: unknown;
  try { cuerpo = JSON.parse((await req.text()) || "{}"); } catch { return fallo(400, "json_invalido", "El cuerpo no es un JSON válido."); }
  const v = PeticionSchema.safeParse(cuerpo);
  if (!v.success) return fallo(400, "peticion_invalida", "La petición no es válida.", { incidencias: v.error.issues.map((i) => ({ campo: i.path.join(".") || null, mensaje: i.message })) });
  try {
    const s = await enviarACertificacion(api.db, { companyId: sesion.companyId, agentId: idAgente, userId: sesion.userId, resumen: v.data.resumen, activarAlAprobar: v.data.activarAlAprobar });
    if (api.examen && api.enSegundoPlano) {
      const d = api.examen;
      api.enSegundoPlano(ejecutarExamen(d, { companyId: sesion.companyId, requestId: s.requestId }).catch((e) => console.error("Error en el examen de certificación", s.requestId, e instanceof Error ? e.message : "desconocido")));
    }
    return json({ solicitudId: s.requestId, tipo: s.tipo, via: s.via, motivos: s.clasificacion.motivos, estado: "pendiente_examen" }, 202);
  } catch (e) {
    if (e instanceof CertificacionError) return fallo(e.status, e.codigo, e.message, e.faltan ? { faltan: e.faltan } : {});
    console.error("Error al enviar a certificación", e instanceof Error ? e.message : "desconocido");
    return fallo(500, "error_interno", "No se pudo enviar a certificación.");
  }
}

export async function informeHandler(req: Request, idAgente: string, api: DepsApiCertificacion): Promise<Response> {
  const sesion = await api.autenticar(req);
  if (!sesion) return fallo(401, "no_autenticado", "Inicia sesión para continuar.");
  if (!z.uuid().safeParse(idAgente).success) return fallo(404, "agente_no_encontrado", "No existe ese agente en vuestra oficina.");
  const { data: s } = await api.db.from("certification_requests").select("id, agent_version, tipo, via, estado, enviado_en, resuelto_en").eq("company_id", sesion.companyId).eq("agent_id", idAgente).order("enviado_en", { ascending: false }).limit(1).maybeSingle();
  if (!s) return fallo(404, "sin_solicitudes", "Este agente no se ha enviado a certificación.");
  const { data: ex } = await api.db.from("certification_exams").select("resultado, nota_global, informe, creado_en").eq("company_id", sesion.companyId).eq("request_id", s.id).order("creado_en", { ascending: false }).limit(1).maybeSingle();
  return json({ solicitud: s, examen: ex ? { resultado: ex.resultado, notaGlobal: ex.nota_global, fecha: ex.creado_en } : null, informe: ex?.informe ?? null });
}

export function depsApiCertificacionDesdeEntorno(env: Record<string, string | undefined> = process.env): DepsApiCertificacion | null {
  const url = env.NEXT_PUBLIC_SUPABASE_URL, key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  const db = createClient(url, key, { auth: { persistSession: false } });
  return { db, autenticar: autenticadorSupabase(db, env), examen: depsExamenDesdeEntorno(env) };
}
