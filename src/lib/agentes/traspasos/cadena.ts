/** Reglas de una cadena de traspasos (la base aplica las MISMAS en `agent_traspaso_crear`; esto sirve al almacén en memoria y a las pruebas). */

/** Traspasos máximos en una misma cadena antes de cortarla. */
export const MAX_TRASPASOS_POR_CADENA = 6;

export type TraspasoDeCadena = { fromAgentId: string; toAgentId: string; fichaHash: string };
export type DecisionCadena = { resultado: "creado" } | { resultado: "bucle" | "limite"; motivo: string };

/**
 * ¿Se puede añadir este traspaso a la cadena? Bucle: la misma ficha ya viajó entre esos dos agentes (A → B → A, o repetido).
 * Límite: la cadena ya tiene `max` traspasos.
 */
export function evaluarCadena(historial: TraspasoDeCadena[], nuevo: TraspasoDeCadena, max = MAX_TRASPASOS_POR_CADENA): DecisionCadena {
  const bucle = historial.some((h) => h.fichaHash === nuevo.fichaHash
    && ((h.fromAgentId === nuevo.fromAgentId && h.toAgentId === nuevo.toAgentId) || (h.fromAgentId === nuevo.toAgentId && h.toAgentId === nuevo.fromAgentId)));
  if (bucle) return { resultado: "bucle", motivo: "la misma ficha ya había viajado entre esos dos agentes" };
  if (historial.length + 1 > max) return { resultado: "limite", motivo: `la cadena ya tiene ${historial.length} traspasos (el máximo es ${max})` };
  return { resultado: "creado" };
}
