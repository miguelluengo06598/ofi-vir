/**
 * Cálculos de la web pública (calculadora y tabla de packs). Módulo puro: todas las cifras salen de
 * `tarifas.ts` y de los packs de `credit_packs`; aquí no hay ningún número de créditos escrito a mano.
 */
import type { Pack } from "@/lib/creditos/packs";
import { CONSUMOS_FIJOS, TIPOS_DE_TAREA } from "@/lib/creditos/tarifas";
import { fmtNumber } from "@/lib/format";

/** Lo que gasta un lead nuevo: una cadena típica (responder, avisar al CRM y registrarlo). */
export const CONSUMO_POR_LEAD = [
  { concepto: "Lucía responde y cualifica (tarea estándar)", creditos: TIPOS_DE_TAREA.estandar.creditos },
  { concepto: "Correo de respuesta enviado", creditos: CONSUMOS_FIJOS.correo },
  { concepto: "Traspaso de Ventas a Operaciones · CRM", creditos: CONSUMOS_FIJOS.traspaso },
  { concepto: "Iván lo registra en el CRM (tarea simple)", creditos: TIPOS_DE_TAREA.simple.creditos },
] as const;

/** Lo que gasta responder un mensaje de un cliente (calculado como respuesta por correo). */
export const CONSUMO_POR_MENSAJE = [
  { concepto: "Respuesta a una consulta (tarea simple)", creditos: TIPOS_DE_TAREA.simple.creditos },
  { concepto: "Correo de respuesta enviado", creditos: CONSUMOS_FIJOS.correo },
] as const;

const suma = (lista: readonly { creditos: number }[]) => lista.reduce((n, x) => n + x.creditos, 0);
export const CREDITOS_POR_LEAD = suma(CONSUMO_POR_LEAD);
export const CREDITOS_POR_MENSAJE = suma(CONSUMO_POR_MENSAJE);

/** Entero ≥ 0 a partir de lo que escribe el visitante (vacío o basura = 0; con tope razonable). */
export function leerCantidad(texto: string, maximo = 1_000_000): number {
  const n = Math.floor(Number(texto.replace(/\./g, "").replace(",", ".")));
  return Number.isFinite(n) && n > 0 ? Math.min(n, maximo) : 0;
}

export function creditosEstimados(leads: number, mensajes: number): number {
  return leads * CREDITOS_POR_LEAD + mensajes * CREDITOS_POR_MENSAJE;
}

/** Pack recurrente más pequeño que cubre el consumo del mes (sin el Prueba, que es de una vez). */
export function packRecomendado(packs: readonly Pack[], creditosMes: number): Pack | null {
  const recurrentes = packs.filter((p) => !p.soloUnaVez).sort((a, b) => a.creditos - b.creditos);
  return recurrentes.find((p) => p.creditos >= creditosMes) ?? null;
}

/** «≈ N» tareas de un tipo que caben en una cantidad de créditos (hacia abajo). */
export const tareasQueCaben = (creditos: number, tipo: keyof typeof TIPOS_DE_TAREA) =>
  Math.floor(creditos / TIPOS_DE_TAREA[tipo].creditos);

/** Céntimos (enteros) → «19 €» o «19,90 €». */
export function euros(centimos: number): string {
  const conDecimales = centimos % 100 !== 0;
  return `${fmtNumber(centimos / 100, conDecimales ? 2 : 0)} €`;
}

/** Meses (o días) de caducidad legibles a partir de los días del pack. */
export function caducidad(dias: number): string {
  if (dias % 365 === 0) return dias === 365 ? "12 meses" : `${(dias / 365) * 12} meses`;
  return `${dias} días`;
}

/** Bono mensual en % sobre los créditos del pack (redondeado), o null si el pack no lo admite. */
export function bonoPorcentaje(p: Pack): number | null {
  return p.creditosBonoMensual ? Math.round(((p.creditosBonoMensual - p.creditos) / p.creditos) * 100) : null;
}

/** Una conversación de WhatsApp o chat resuelta por un agente. El envío por WhatsApp tendrá su tarifa (pendiente). */
export const CONSUMO_POR_CONVERSACION = [
  { concepto: "Atender la conversación (tarea simple)", creditos: TIPOS_DE_TAREA.simple.creditos },
] as const;

/** Un correo de un cliente contestado: la respuesta y su envío. */
export const CONSUMO_POR_CORREO = CONSUMO_POR_MENSAJE;

export const CREDITOS_POR_CONVERSACION = suma(CONSUMO_POR_CONVERSACION);
export const CREDITOS_POR_CORREO = suma(CONSUMO_POR_CORREO);

export function creditosDelMes(v: { leads: number; conversaciones: number; correos: number }): number {
  return v.leads * CREDITOS_POR_LEAD + v.conversaciones * CREDITOS_POR_CONVERSACION + v.correos * CREDITOS_POR_CORREO;
}
