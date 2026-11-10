/**
 * Enviar un agente a certificación: comprueba los requisitos, clasifica el cambio, decide la vía, crea la solicitud y deja el examen
 * pendiente. Solo servidor.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { clasificarSolicitud, type Clasificacion } from "./clasificar.ts";
import { cargarConfiguracion, type ConfigVersion } from "./clonar.ts";
import { requisitosParaCertificar, type Requisito } from "./requisitos.ts";

export class CertificacionError extends Error {
  readonly status: number; readonly codigo: string;
  /** Con `faltan_requisitos`: la lista de lo que falta. */
  readonly faltan?: Requisito[];
  constructor(status: number, codigo: string, mensaje: string, faltan?: Requisito[]) { super(mensaje); this.status = status; this.codigo = codigo; this.faltan = faltan; }
}

export type TipoSolicitud = "nueva" | "cambio_menor" | "cambio_importante" | "plantilla";
export type Via = "rapida_plantilla" | "completa";
export type SolicitudEnviada = { requestId: string; tipo: TipoSolicitud; via: Via; clasificacion: Clasificacion };

type HerramientaDePlantilla = { id: string; permiso_defecto: string; editable?: boolean };

/** ¿Lo que ha cambiado la empresa cabe en lo que la plantilla deja cambiar? (herramientas de la plantilla, con permisos permitidos). */
export function soloCambiaLoPermitido(config: ConfigVersion, herramientasDePlantilla: HerramientaDePlantilla[]): boolean {
  const porId = new Map(herramientasDePlantilla.map((h) => [h.id, h]));
  return config.herramientas.every((t) => {
    const h = porId.get(t.tool_id);
    return !!h && (h.editable === true || h.permiso_defecto === t.permiso);
  });
}

/**
 * Vía rápida: el agente viene de una plantilla cuya versión está certificada y solo cambia lo que la plantilla permite.
 * Cualquier otro caso (agente propio, plantilla sin certificar, herramientas fuera de la plantilla), vía completa.
 */
export async function viaDeCertificacion(db: SupabaseClient, config: ConfigVersion): Promise<Via> {
  const id = config.ficha.template_id, version = config.plantilla_version ?? null;
  if (!id || version === null) return "completa";
  const [cert, tpl] = await Promise.all([
    db.rpc("plantilla_certificada", { p_template_id: id, p_version: version }),
    db.from("agent_template_versions").select("herramientas_disponibles").eq("template_id", id).eq("version", version).maybeSingle(),
  ]);
  if (cert.error || tpl.error || cert.data !== true || !tpl.data) return "completa";
  return soloCambiaLoPermitido(config, (tpl.data.herramientas_disponibles as HerramientaDePlantilla[]) ?? []) ? "rapida_plantilla" : "completa";
}

export async function enviarACertificacion(
  db: SupabaseClient,
  e: { companyId: string; agentId: string; userId: string | null; resumen?: string; /** «plantilla»: actualización a una versión nueva de la plantilla. */ tipo?: "plantilla"; /** La empresa quiere que se active solo en cuanto quede certificado. */ activarAlAprobar?: boolean },
): Promise<SolicitudEnviada> {
  const { data: a } = await db.from("agents").select("version_actual, version_certificada, template_id").eq("company_id", e.companyId).eq("id", e.agentId).maybeSingle();
  if (!a) throw new CertificacionError(404, "agente_no_encontrado", "No existe ese agente en vuestra oficina.");

  const faltan = await requisitosParaCertificar(db, e.companyId, e.agentId);
  if (faltan?.length) throw new CertificacionError(422, "faltan_requisitos", `Antes de enviar a certificación falta: ${faltan.map((f) => f.mensaje).join(" ")}`, faltan);

  const actual = await cargarConfiguracion(db, e.companyId, e.agentId, a.version_actual as number);
  let certificada: ConfigVersion | null = null;
  if (a.version_certificada != null) {
    const { data: v } = await db.from("agent_versions").select("snapshot").eq("company_id", e.companyId).eq("agent_id", e.agentId).eq("version", a.version_certificada).maybeSingle();
    certificada = (v?.snapshot as ConfigVersion | undefined) ?? null;
  }
  const clasificacion = clasificarSolicitud(certificada, actual.config);
  const tipo: TipoSolicitud = e.tipo === "plantilla" && certificada ? "plantilla" : clasificacion.tipo;
  const via = await viaDeCertificacion(db, actual.config);
  const { data, error } = await db.rpc("certificacion_enviar", {
    p_company_id: e.companyId, p_agent_id: e.agentId, p_user_id: e.userId, p_tipo: tipo, p_via: via,
    p_resumen: e.resumen ?? clasificacion.motivos.join(" "), p_motivos: clasificacion.motivos,
  });
  if (error) {
    if (error.code === "P0001") throw new CertificacionError(409, "no_se_puede_enviar", error.message);
    if (error.code === "23505") throw new CertificacionError(409, "solicitud_abierta", "Ya hay una solicitud de certificación abierta para este agente.");
    throw new CertificacionError(500, "error", "No se pudo enviar a certificación.");
  }
  if (e.activarAlAprobar) await db.from("certification_requests").update({ activar_al_aprobar: true }).eq("company_id", e.companyId).eq("id", data as string);
  return { requestId: data as string, tipo, via, clasificacion };
}
