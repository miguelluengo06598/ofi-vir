/**
 * Asistente de configuración: convierte lo que la empresa cuenta en lenguaje normal en una PROPUESTA de configuración del
 * agente (turnoAsistente) y, cuando la empresa lo decide, la aplica creando una versión nueva (aplicarPropuesta).
 * SOLO SERVIDOR. Recibe sus dependencias por parámetro (almacén, modelo, créditos) para poder probarlo sin base ni red.
 *
 * Seguridad:
 *  - El asistente nunca recibe las instrucciones base de la plantilla (el contexto no tiene ni el campo).
 *  - La salida del modelo es una propuesta: no se guarda en el agente hasta aplicarla. Lo que se puede aplicar lo decide el
 *    código (permisos que la plantilla permite, traspasos a agentes de la empresa), y la base lo vuelve a comprobar.
 *  - Cada turno es una tarea experta: reserva de créditos antes, cobro al terminar bien, liberación si falla.
 */
import { randomUUID } from "node:crypto";
import type { LlmClient, LlmMessage, LlmResponse, LlmUsage } from "../../agents/llm.ts";
import { sumarUso, USO_VACIO } from "../../agents/pricing.ts";
import { calcularCosteIA, creditosParaTarea, TIPOS_DE_TAREA } from "../../creditos/tarifas.ts";
import type { ServicioCreditos } from "../../creditos/servicio.ts";
import { CAMPOS_APLICABLES, MAX_MENSAJES_SESION, PropuestaSchema, type CampoAplicable, type MensajeSesion, type Propuesta } from "./esquemas.ts";
import { HERRAMIENTA_PROPUESTA, peticionAlModelo } from "./prompt.ts";
import { cambiosDesdePropuesta, permisosQueCambian, problemasDePropuesta, sanearPropuesta } from "./propuesta.ts";
import type { AlmacenAsistente, ContextoAgente } from "./tipos.ts";

export const TIPO_DE_TAREA_ASISTENTE = "experta" as const;
export const MOTIVO_VERSION = "configuración con el asistente";
const ESTADOS_NO_EDITABLES = ["en_certificacion", "suspendido", "archivado"];

export class AsistenteError extends Error {
  readonly status: number;
  readonly codigo: string;
  readonly extra: Record<string, unknown>;
  constructor(status: number, codigo: string, mensaje: string, extra: Record<string, unknown> = {}) {
    super(mensaje);
    this.status = status;
    this.codigo = codigo;
    this.extra = extra;
  }
}

export type DepsAsistente = {
  almacen: AlmacenAsistente;
  llm: LlmClient;
  creditos: Pick<ServicioCreditos, "reservar" | "confirmar" | "liberar">;
  ahora?: () => Date;
  nuevoId?: () => string;
  log?: Pick<Console, "warn" | "error">;
};

export type EntradaTurno = { companyId: string; userId: string; agentId: string; mensaje: string; sesionId?: string };
export type ResultadoTurno = {
  sesionId: string;
  propuesta: Propuesta;
  /** Cosas que el código ha descartado o fijado de la propuesta del modelo (para que la empresa lo sepa). */
  avisos: string[];
  /** Permisos de herramientas que cambian respecto a ahora. */
  permisosQueCambian: { herramienta_id: string; de: string | null; a: string }[];
  versionBase: number;
  creditos: number;
};

function comprobarEditable(c: ContextoAgente) {
  if (ESTADOS_NO_EDITABLES.includes(c.agente.estado)) {
    throw new AsistenteError(409, "agente_no_editable", `Un agente en estado «${c.agente.estado}» no se puede reconfigurar ahora.`);
  }
}

/** Pide la propuesta al modelo (salida estructurada). Si no cumple el esquema, se lo dice y reintenta UNA vez. */
async function pedirPropuesta(llm: LlmClient, base: ReturnType<typeof peticionAlModelo>): Promise<{ propuesta: Propuesta; uso: LlmUsage }> {
  let uso = USO_VACIO;
  let mensajes: LlmMessage[] = base.messages;
  let ultimoError = "";
  for (let intento = 0; intento < 2; intento++) {
    const r: LlmResponse = await llm.create({ ...base, messages: mensajes });
    uso = sumarUso(uso, r.usage);
    const bloque = r.content.find((b) => b.type === "tool_use" && b.name === HERRAMIENTA_PROPUESTA) as { id: string; input: unknown } | undefined;
    if (!bloque) {
      ultimoError = `El modelo no devolvió la propuesta (${r.stopReason ?? "sin motivo"}).`;
      break;
    }
    const v = PropuestaSchema.safeParse(bloque.input);
    if (v.success) return { propuesta: v.data, uso };
    ultimoError = v.error.issues.slice(0, 8).map((i) => `${i.path.join(".") || "propuesta"}: ${i.message}`).join("; ");
    mensajes = [
      ...base.messages,
      { role: "assistant", content: r.content },
      { role: "user", content: [{ type: "tool_result", tool_use_id: bloque.id, is_error: true, content: `La propuesta no es válida: ${ultimoError}. Corrígela y vuelve a llamar a ${HERRAMIENTA_PROPUESTA}.` }] },
    ];
  }
  throw Object.assign(new AsistenteError(502, "propuesta_invalida", "El asistente no ha podido preparar una propuesta válida. Inténtalo de nuevo."), { uso, detalle: ultimoError });
}

/** Un turno de la conversación: la empresa escribe y el asistente devuelve la propuesta actualizada. No guarda nada en el agente. */
export async function turnoAsistente(deps: DepsAsistente, e: EntradaTurno): Promise<ResultadoTurno> {
  const { almacen } = deps;
  const log = deps.log ?? console;
  const ahora = (deps.ahora ?? (() => new Date()))();

  const contexto = await almacen.cargarContexto(e.companyId, e.agentId);
  if (!contexto) throw new AsistenteError(404, "agente_no_encontrado", "No existe ese agente en vuestra oficina.");
  comprobarEditable(contexto);

  let historial: MensajeSesion[] = [];
  let propuestaPrevia: unknown | null = null;
  if (e.sesionId) {
    const s = await almacen.cargarSesion(e.companyId, e.agentId, e.sesionId);
    if (!s) throw new AsistenteError(404, "sesion_no_encontrada", "No existe esa conversación para este agente.");
    if (s.estado !== "abierta") throw new AsistenteError(409, "sesion_cerrada", "Esa propuesta ya se aplicó. Empieza una conversación nueva para seguir configurando.");
    if (s.mensajes.length >= MAX_MENSAJES_SESION) throw new AsistenteError(409, "sesion_demasiado_larga", "La conversación es demasiado larga. Aplica la propuesta o empieza otra.");
    historial = s.mensajes;
    propuestaPrevia = s.propuestaActual;
  }

  // Créditos: tarea experta. Se reserva antes de llamar al modelo (si falta saldo, no se llama).
  const tipo = TIPOS_DE_TAREA[TIPO_DE_TAREA_ASISTENTE];
  const creditos = creditosParaTarea(TIPO_DE_TAREA_ASISTENTE);
  const taskId = (deps.nuevoId ?? randomUUID)();
  const reserva = await deps.creditos.reservar(e.companyId, taskId, creditos, { agentId: e.agentId, departmentId: contexto.agente.departmentId });

  const registrarCoste = async (uso: LlmUsage, cobrados: number) => {
    try {
      await almacen.registrarCoste({
        taskId, companyId: e.companyId, agentId: e.agentId, modelo: tipo.modeloPorDefecto, uso, creditosCobrados: cobrados,
        costeIaUsdMicros: calcularCosteIA(tipo.modeloPorDefecto, uso.inputTokens + uso.cacheWriteTokens, uso.outputTokens, uso.cacheReadTokens),
      });
    } catch (err) {
      log.error("No se pudo registrar el coste del asistente", err instanceof Error ? err.message : err);
    }
  };

  let propuesta: Propuesta, uso: LlmUsage;
  try {
    ({ propuesta, uso } = await pedirPropuesta(deps.llm, peticionAlModelo({
      modelo: tipo.modeloPorDefecto, maxTokens: tipo.maxTokensSalida, contexto, propuestaActual: propuestaPrevia, historial, mensaje: e.mensaje,
    })));
  } catch (err) {
    // Fallo nuestro (modelo caído o respuesta inválida): no se cobra. Si el modelo llegó a gastar, el coste real queda registrado.
    await deps.creditos.liberar(reserva.reservaId).catch((x) => log.error("No se pudo liberar la reserva", x instanceof Error ? x.message : x));
    const usoGastado = (err as { uso?: LlmUsage }).uso;
    if (usoGastado) await registrarCoste(usoGastado, 0);
    if (err instanceof AsistenteError) throw err;
    log.error("El modelo del asistente falló", err instanceof Error ? err.message.slice(0, 300) : err);
    throw new AsistenteError(502, "modelo_no_disponible", "El asistente no está disponible ahora mismo. No se ha cobrado nada; inténtalo de nuevo en un momento.");
  }

  const { propuesta: saneada, avisos } = sanearPropuesta(propuesta, contexto);
  const mensajes: MensajeSesion[] = [
    ...historial,
    { rol: "empresa", texto: e.mensaje, en: ahora.toISOString() },
    { rol: "asistente", texto: saneada.respuesta, en: ahora.toISOString() },
  ];

  let sesionId: string;
  try {
    sesionId = await almacen.guardarSesion({ id: e.sesionId, companyId: e.companyId, agentId: e.agentId, userId: e.userId, mensajes, propuesta: saneada, versionBase: contexto.agente.versionActual });
  } catch (err) {
    await deps.creditos.liberar(reserva.reservaId).catch(() => undefined);
    await registrarCoste(uso, 0);
    log.error("No se pudo guardar la conversación del asistente", err instanceof Error ? err.message : err);
    throw new AsistenteError(500, "error_interno", "No se pudo guardar la conversación. No se ha cobrado nada.");
  }

  try {
    await deps.creditos.confirmar(reserva.reservaId, creditos, { tipo: TIPO_DE_TAREA_ASISTENTE, agentId: e.agentId, departmentId: contexto.agente.departmentId, claveIdempotencia: `asistente:${taskId}`, metadatos: { origen: "asistente_configuracion" } });
  } catch (err) {
    log.error("El asistente respondió pero no se pudo confirmar el cobro", err instanceof Error ? err.message : err);
  }
  await registrarCoste(uso, creditos);

  return { sesionId, propuesta: saneada, avisos, permisosQueCambian: permisosQueCambian(saneada, contexto), versionBase: contexto.agente.versionActual, creditos };
}

export type EntradaAplicar = { companyId: string; userId: string; agentId: string; sesionId: string; campos?: readonly CampoAplicable[] };
export type ResultadoAplicado = { version: number; aplicado: CampoAplicable[]; permisosCambiados: number; traspasosCreados: number };

/**
 * Aplica la propuesta guardada en la conversación (o solo los campos marcados) y crea la versión nueva del agente.
 * Parte SIEMPRE de la propuesta guardada en el servidor, nunca de lo que mande el cliente. Si algún permiso o traspaso no
 * está permitido, se rechaza todo (no se aplica a medias).
 */
export async function aplicarPropuesta(deps: DepsAsistente, e: EntradaAplicar): Promise<ResultadoAplicado> {
  const { almacen } = deps;
  const contexto = await almacen.cargarContexto(e.companyId, e.agentId);
  if (!contexto) throw new AsistenteError(404, "agente_no_encontrado", "No existe ese agente en vuestra oficina.");
  comprobarEditable(contexto);

  const sesion = await almacen.cargarSesion(e.companyId, e.agentId, e.sesionId);
  if (!sesion) throw new AsistenteError(404, "sesion_no_encontrada", "No existe esa conversación para este agente.");
  if (sesion.estado !== "abierta") throw new AsistenteError(409, "sesion_cerrada", "Esa propuesta ya se aplicó.");
  const v = PropuestaSchema.safeParse(sesion.propuestaActual);
  if (!v.success) throw new AsistenteError(409, "sin_propuesta", "Esa conversación todavía no tiene una propuesta que aplicar.");
  if (sesion.versionBase !== contexto.agente.versionActual) {
    throw new AsistenteError(409, "version_cambiada", "El agente ha cambiado desde que se hizo la propuesta. Pide una propuesta nueva.", { versionActual: contexto.agente.versionActual });
  }

  const campos = e.campos ?? CAMPOS_APLICABLES;
  const propuesta = v.data;
  // Solo se comprueba lo que se va a aplicar.
  const aComprobar = { permisos: campos.includes("permisos") ? propuesta.permisos : [], traspasos: campos.includes("traspasos") ? propuesta.traspasos : [] };
  const problemas = problemasDePropuesta(aComprobar, contexto);
  if (problemas.length) throw new AsistenteError(422, "propuesta_no_permitida", "La propuesta incluye cambios que este agente no permite. No se ha aplicado nada.", { problemas });

  let r;
  try {
    r = await almacen.aplicar({
      companyId: e.companyId, agentId: e.agentId, userId: e.userId, sesionId: e.sesionId, versionEsperada: contexto.agente.versionActual,
      cambios: cambiosDesdePropuesta(propuesta, campos), motivo: MOTIVO_VERSION,
    });
  } catch (err) {
    const m = err instanceof Error ? err.message : String(err);
    if (m.startsWith("HERRAMIENTA_NO_PERMITIDA")) throw new AsistenteError(422, "propuesta_no_permitida", "La plantilla no permite uno de los permisos propuestos. No se ha aplicado nada.", { problemas: [m] });
    if (m.startsWith("VERSION_CAMBIADA")) throw new AsistenteError(409, "version_cambiada", "El agente ha cambiado desde que se hizo la propuesta. Pide una propuesta nueva.");
    if (m.startsWith("SOLICITUD_ABIERTA")) throw new AsistenteError(409, "solicitud_abierta", "Hay una versión de este agente en certificación. Espera al resultado o cancela la solicitud antes de aplicar más cambios.");
    if (m.startsWith("AGENTE_NO_EDITABLE")) throw new AsistenteError(409, "agente_no_editable", "El agente no se puede reconfigurar ahora.");
    throw err;
  }
  return { version: r.version, aplicado: [...campos], permisosCambiados: r.permisosAplicados, traspasosCreados: r.traspasosCreados };
}
