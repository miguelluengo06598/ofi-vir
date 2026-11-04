import { envolverContenidoExterno } from "../email/untrusted.ts";

/** Dirección de prueba de Resend: en desarrollo es la única a la que se puede enviar sin lista blanca. */
export const CORREO_DE_PRUEBA = "delivered@resend.dev";

/** Lead ficticio de las tareas de prueba. Es contenido externo (llega de fuera), así que va delimitado. */
export function instruccionLeadDePrueba(): string {
  return [
    "Es una tarea de PRUEBA con un lead ficticio. Acaba de llegar esta solicitud por el formulario web.",
    "Mira si ya consta en la memoria, guarda lo que sepas del contacto, redacta un correo de respuesta (queda como borrador pendiente de aprobación) y propón el siguiente paso.",
    "",
    envolverContenidoExterno({
      de: `Marina Campos <${CORREO_DE_PRUEBA}>`,
      asunto: "Quiero información sobre la gestión de citas con IA",
      recibidoEl: new Date().toISOString(),
      texto:
        "Hola, soy Marina Campos, gerente de Clínica Dental Campos (Valencia, 6 puestos). Vi vuestro anuncio y me interesa el sistema de recordatorios de citas por WhatsApp. ¿Cuánto cuesta y en cuánto tiempo se puede poner en marcha? Gracias.",
    }),
  ].join("\n");
}
