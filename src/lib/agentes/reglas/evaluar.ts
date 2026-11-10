/** Decisiones puras de las reglas (sin base de datos ni reloj propio): reciben la hora y los contadores. Todo lo que se prueba con fechas simuladas vive aquí. */
import type { ReglasAgente } from "../instrucciones.ts";
import { dentroDeHorario, proximaApertura } from "./horario.ts";
import { AVISO_IA_POR_DEFECTO } from "./tipos.ts";

export type DecisionLanzamiento =
  | { accion: "ejecutar"; fueraDeHorario: boolean }
  | { accion: "aplazar"; hasta: Date; motivo: string }
  | { accion: "bloquear"; causa: "tope_creditos" | "sin_apertura"; motivo: string };

/**
 * ¿Se lanza el agente? 1) tope mensual de créditos (cualquier tarea); 2) horario, solo para mensajes de personas de fuera:
 * con «no_responder» y fuera de horario no se lanza: se aplaza hasta la próxima apertura.
 */
export function decidirLanzamiento(r: ReglasAgente, c: { ahora: Date; esMensajeExterno: boolean; creditosMes: number }): DecisionLanzamiento {
  if (r.topeCreditosMes !== null && c.creditosMes >= r.topeCreditosMes) {
    return { accion: "bloquear", causa: "tope_creditos", motivo: `Este agente ha alcanzado su tope de ${r.topeCreditosMes} créditos este mes (lleva ${c.creditosMes}): la tarea no se ha ejecutado.` };
  }
  const dentro = dentroDeHorario(r.horario, r.zonaHoraria, c.ahora);
  if (dentro || !c.esMensajeExterno || r.fueraDeHorario !== "no_responder") return { accion: "ejecutar", fueraDeHorario: !dentro };
  const apertura = proximaApertura(r.horario, r.zonaHoraria, c.ahora);
  if (!apertura) return { accion: "bloquear", causa: "sin_apertura", motivo: "Fuera de horario y el horario del agente no tiene ninguna franja de apertura: la tarea no se ha ejecutado." };
  return { accion: "aplazar", hasta: apertura, motivo: `Fuera de horario: el mensaje se ha guardado y se procesará cuando abra (${apertura.toISOString()}).` };
}

/** Texto del aviso de IA de esta empresa (o el de por defecto). */
export const textoAvisoIa = (r: ReglasAgente) => r.avisoIaTexto?.trim() || AVISO_IA_POR_DEFECTO;

const normaliza = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").replace(/\s+/g, " ").trim().toLowerCase();
const contiene = (texto: string, frase: string) => normaliza(texto).includes(normaliza(frase));

/**
 * Añade al mensaje el aviso de IA (al principio) y/o el mensaje de fuera de horario (al final). Idempotente: si el texto ya lo
 * lleva (la IA lo escribió, o es un mensaje ya compuesto que vuelve de una aprobación), no se repite.
 */
export function componerMensaje(texto: string, o: { avisoIa: string | null; fueraHorario: string | null }): { texto: string; aviso: boolean; fuera: boolean } {
  let out = texto;
  let aviso = false, fuera = false;
  if (o.avisoIa && !contiene(out, o.avisoIa)) { out = `${o.avisoIa}\n\n${out}`; aviso = true; }
  if (o.fueraHorario && !contiene(out, o.fueraHorario)) { out = `${out}\n\n${o.fueraHorario}`; fuera = true; }
  return { texto: out, aviso, fuera };
}

export type EntradaEnvio = {
  ahora: Date;
  /** Mensajes externos de este agente desde las 00:00 de hoy (zona del agente). */
  enviadosHoy: number;
  /** ¿La llamada viene de una aprobación que una persona acaba de dar? Entonces el límite diario no la frena. */
  aprobada: boolean;
  /** La tarea responde a algo que escribió una persona de fuera. */
  respondeAExterno: boolean;
  /** ¿Ya se avisó de que es una IA a este contacto en este canal? */
  avisoIaDado: boolean;
};

export type DecisionEnvio = {
  /** Motivo por el que NO se puede enviar (horario con «no_responder»). */
  bloquear: string | null;
  /** El límite diario está alcanzado: lo siguiente pasa a aprobación y se avisa a la empresa. */
  limiteAlcanzado: boolean;
  /** Texto del aviso de IA que hay que añadir (null si ya se dio o ya está en el texto). */
  avisoIa: string | null;
  /** Mensaje de fuera de horario que hay que añadir (null si no procede). */
  fueraHorario: string | null;
};

export function decidirEnvio(r: ReglasAgente, e: EntradaEnvio): DecisionEnvio {
  const dentro = dentroDeHorario(r.horario, r.zonaHoraria, e.ahora);
  const fuera = !dentro && e.respondeAExterno;
  return {
    bloquear: fuera && r.fueraDeHorario === "no_responder"
      ? "Fuera de horario: no puedes responder a clientes ahora. El mensaje se procesará cuando abra el horario; resume lo ocurrido y termina."
      : null,
    limiteAlcanzado: r.maxMensajesDia !== null && !e.aprobada && e.enviadosHoy >= r.maxMensajesDia,
    avisoIa: e.avisoIaDado ? null : textoAvisoIa(r),
    fueraHorario: fuera && r.fueraDeHorario === "responder_y_avisar" && r.mensajeFueraHorario?.trim() ? r.mensajeFueraHorario.trim() : null,
  };
}
