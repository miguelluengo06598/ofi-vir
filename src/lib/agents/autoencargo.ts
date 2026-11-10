/**
 * Sin autoencargos: un agente nunca se crea tareas, ni se programa trabajo, ni crea tareas para otros agentes fuera de
 * `pasar_a_agente`. No existe ninguna herramienta que lo haga; si el modelo pide algo parecido («volver a revisar más tarde»,
 * «programar_tarea», «recordatorio»…), recibe esta respuesta en lugar de un simple «no disponible».
 */
const PARECE_AUTOENCARGO = /(program|schedul|remind|recordat|recuerda|mas_?tarde|later|despues|luego|esperar|wait|sleep|cron|rutina|routine|repet|reintent|retry|revis.*(tarde|luego|despues)|crear_?tarea|nueva_?tarea|create_?task|new_?task|asignar|autoencarg|follow_?up|seguimiento|poll|vigil|monitor|check_?back)/i;

export const MENSAJE_AUTOENCARGO =
  "No está permitido: no puedes crearte tareas, programar trabajo para más tarde, quedarte esperando ni crear tareas para otros agentes. "
  + "Si otro agente debe continuar, usa pasar_a_agente. Si hay que hacer algo en el futuro, propónlo con proponer_seguimiento (una persona decide). "
  + "Si no, termina con tu resumen.";

/** Si la herramienta pedida parece un intento de autoencargo, devuelve el mensaje para el modelo; si no, null. */
export const mensajeSiAutoencargo = (nombre: string): string | null => (PARECE_AUTOENCARGO.test(nombre) && nombre !== "proponer_seguimiento" ? MENSAJE_AUTOENCARGO : null);
