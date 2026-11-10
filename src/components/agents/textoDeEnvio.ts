import type { EnvioCertificacion } from "@/lib/agentes/versiones/servicio";

export const TIPO_DE_SOLICITUD: Record<string, string> = {
  nueva: "Certificación nueva", cambio_menor: "Cambio menor (solo examen)", cambio_importante: "Cambio importante (certificación completa)",
  periodica: "Recertificación periódica", cambio_modelo: "Examen por cambio de modelo de IA", plantilla: "Actualización de plantilla",
};

/** Qué ha pasado con el envío a certificación tras guardar un cambio, en una frase para la persona. */
export function textoDeEnvio(c: EnvioCertificacion | null, aplicada: boolean): string {
  if (!c) return aplicada ? "Cambio aplicado." : "Cambio guardado.";
  if (c.enviada) return `Enviado a certificación (${(TIPO_DE_SOLICITUD[c.tipo] ?? c.tipo).toLowerCase()}). Mientras tanto sigue trabajando la versión certificada.`;
  return `La versión se ha guardado, pero no se ha podido enviar a certificación: ${c.motivo}`;
}
