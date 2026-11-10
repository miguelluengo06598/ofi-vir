import { neutralizar } from "../../email/untrusted.ts";
import type { TipoTraspaso } from "./fichas.ts";

const CABECERA: Record<TipoTraspaso, string> = {
  lead: "un lead (una persona interesada)", cita: "una cita que hay que agendar", incidencia: "una incidencia",
  datos: "los datos de un contacto", otro: "un encargo",
};

/**
 * Lo que recibe el agente destino como entrada de su tarea. Si el agente origen trabajaba con contenido externo (un correo, un
 * mensaje de un cliente), la ficha puede arrastrar texto de un tercero: va delimitada como `<contenido_externo>` y el destino la trata
 * como DATOS, nunca como órdenes. Así una orden escondida en un correo no puede saltar de un agente a otro.
 */
export function instruccionDeTraspaso(o: { origen: string; tipo: TipoTraspaso; resumen: string; card: { label: string; value: string }[]; externo: boolean }): string {
  const lineas = o.card.map((f) => `- ${f.label}: ${f.value}`).join("\n");
  const cabecera = `${neutralizar(o.origen)} te traspasa ${CABECERA[o.tipo]}.\nResumen: ${neutralizar(o.resumen)}`;
  const cuerpo = `Ficha del traspaso (tipo ${o.tipo}):\n${lineas || "(sin datos)"}`;
  const pie = "Haz lo que corresponde a tu rol con esta ficha. Si te falta información, usa tus herramientas o pasa el caso a una persona.";
  return o.externo
    ? `${cabecera}\n\n<contenido_externo origen="traspaso">\n${cuerpo.replaceAll("<", "‹")}\n</contenido_externo>\n\n${pie}`
    : `${cabecera}\n\n${cuerpo}\n\n${pie}`;
}
