/**
 * Filtro de eventos externos SIN IA: decide si algo que llega de fuera merece que trabaje un agente. Así los agentes no trabajan por
 * ruido (boletines, avisos automáticos, respuestas de vacaciones, rebotes, duplicados, ráfagas). Lo descartado queda registrado con su
 * motivo y no gasta créditos. Funciones puras: sin base de datos ni red.
 */
import { createHash } from "node:crypto";

/** Varios mensajes de la misma persona en esta ventana van en una sola tarea. */
export const VENTANA_RAFAGA_SEGUNDOS = 30;
/** Eventos aceptados por minuto y empresa (por defecto; cada empresa lo puede cambiar en `company_credit_settings.eventos_por_minuto`). */
export const EVENTOS_POR_MINUTO_POR_DEFECTO = 20;
/** Un evento en cola se vuelve a intentar pasado este tiempo. */
export const ESPERA_EN_COLA_SEGUNDOS = 60;

export type Canal = "correo" | "whatsapp" | "meta_lead" | "formulario" | "otro";
export type MotivoDescarte = "newsletter" | "notificacion_automatica" | "respuesta_automatica" | "rebote" | "duplicado";

export const TEXTO_MOTIVO: Record<MotivoDescarte | "rafaga" | "limite_por_minuto", string> = {
  newsletter: "Boletín o envío masivo: no lo atiende ningún agente.",
  notificacion_automatica: "Notificación automática de un sistema: no lo atiende ningún agente.",
  respuesta_automatica: "Respuesta automática (vacaciones, fuera de la oficina): no lo atiende ningún agente.",
  rebote: "Rebote o aviso de entrega fallida: no lo atiende ningún agente.",
  duplicado: "Evento duplicado: ya se recibió antes.",
  rafaga: "Mensaje seguido de la misma persona: va en la misma tarea que el anterior.",
  limite_por_minuto: "Demasiados eventos en el último minuto: queda en cola.",
};

const cabecera = (h: Record<string, string>, nombre: string) => Object.entries(h).find(([k]) => k.toLowerCase() === nombre)?.[1]?.trim() ?? "";

/** ¿Es un correo automático (boletín, notificación, respuesta automática, rebote)? Devuelve el motivo o null. */
export function motivoCorreoAutomatico(c: { from: string; subject: string; headers: Record<string, string> }): MotivoDescarte | null {
  const h = c.headers;
  const from = c.from.toLowerCase();
  const asunto = c.subject.toLowerCase();
  const tipo = cabecera(h, "content-type").toLowerCase();

  // Rebotes: el servidor de correo avisa de que no se pudo entregar.
  if (/^(mailer-daemon|postmaster)@/.test(from) || /multipart\/report.*delivery-status/.test(tipo)
    || /(undeliver|delivery status notification|mail delivery (failed|subsystem)|returned mail|failure notice|no se (ha podido|pudo) entregar|error de entrega|mensaje no entregado)/.test(asunto)) {
    return "rebote";
  }
  // Respuestas automáticas (RFC 3834 y cabeceras habituales de Outlook/Exchange).
  const auto = cabecera(h, "auto-submitted").toLowerCase();
  if (auto === "auto-replied" || cabecera(h, "x-autoreply") || cabecera(h, "x-autorespond") || /auto_reply/i.test(cabecera(h, "precedence"))
    || /^(respuesta autom[aá]tica|fuera de la oficina|automatic reply|auto[- ]?reply|out of (the )?office|ausencia|de vacaciones|vacation)/.test(asunto.replace(/^(re|rv|fw|fwd):\s*/i, ""))) {
    return "respuesta_automatica";
  }
  // Boletines y envíos masivos.
  if (cabecera(h, "list-unsubscribe") || cabecera(h, "list-id") || /^(bulk|list|junk)$/i.test(cabecera(h, "precedence"))
    || cabecera(h, "x-campaign") || cabecera(h, "x-mailchimp-campaign") || /^(newsletter|boletin|news|marketing)@/.test(from)) {
    return "newsletter";
  }
  // Notificaciones automáticas de sistemas.
  if ((auto && auto !== "no") || /^(no-?reply|do-?not-?reply|noreply|notifications?|notificaciones|alerts?|avisos)@/.test(from)) {
    return "notificacion_automatica";
  }
  return null;
}

/** Huella de un remitente (dirección o teléfono normalizados): agrupa ráfagas sin guardar el dato. */
export const huellaRemitente = (remitente: string) => createHash("sha256").update(remitente.trim().toLowerCase().replace(/\s+/g, "")).digest("hex");

/** Clave de un evento sin identificador propio: canal + remitente + contenido. Dos envíos idénticos son el mismo evento. */
export const claveDeContenido = (canal: Canal, remitente: string, contenido: string) =>
  createHash("sha256").update(`${canal}\n${remitente.trim().toLowerCase()}\n${contenido.trim()}`).digest("hex");

export type EstadoEvento = "aceptado" | "agrupado" | "en_cola" | "descartado";
export type DecisionEvento =
  | { estado: "aceptado" }
  | { estado: "agrupado"; taskId: string; motivo: string }
  | { estado: "en_cola"; motivo: string; hasta: Date }
  | { estado: "descartado"; motivo: string; codigo: MotivoDescarte };

/** Lo que el filtro necesita consultar (la base en producción; memoria en los tests). */
export interface ConsultasFiltro {
  /** ¿Ya se recibió (aceptado, agrupado o en cola) un evento con esta clave? */
  existeClave(companyId: string, canal: Canal, clave: string): Promise<boolean>;
  /** Tarea aún sin empezar de un evento de ese remitente recibido desde `desde` (para agrupar), o null. */
  tareaPendienteDelRemitente(companyId: string, remitenteHash: string, desde: Date): Promise<string | null>;
  /** Eventos aceptados desde `desde` y el límite por minuto de la empresa. */
  ritmo(companyId: string, desde: Date): Promise<{ aceptados: number; limitePorMinuto: number }>;
}

export type EventoEntrante = { companyId: string; canal: Canal; clave: string | null; remitente: string; automatico?: MotivoDescarte | null };

/** Decide qué hacer con un evento: descartar (automático o duplicado), agrupar (ráfaga), poner en cola (límite) o aceptar. */
export async function decidirEvento(q: ConsultasFiltro, e: EventoEntrante, ahora: Date): Promise<DecisionEvento> {
  if (e.automatico) return { estado: "descartado", codigo: e.automatico, motivo: TEXTO_MOTIVO[e.automatico] };
  if (e.clave && (await q.existeClave(e.companyId, e.canal, e.clave))) return { estado: "descartado", codigo: "duplicado", motivo: TEXTO_MOTIVO.duplicado };
  const pendiente = await q.tareaPendienteDelRemitente(e.companyId, huellaRemitente(e.remitente), new Date(ahora.getTime() - VENTANA_RAFAGA_SEGUNDOS * 1000));
  if (pendiente) return { estado: "agrupado", taskId: pendiente, motivo: TEXTO_MOTIVO.rafaga };
  const r = await q.ritmo(e.companyId, new Date(ahora.getTime() - 60_000));
  if (r.aceptados >= r.limitePorMinuto) return { estado: "en_cola", motivo: TEXTO_MOTIVO.limite_por_minuto, hasta: new Date(ahora.getTime() + ESPERA_EN_COLA_SEGUNDOS * 1000) };
  return { estado: "aceptado" };
}
