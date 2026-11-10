/**
 * ¿Necesita segunda opinión antes de cerrarse? Lo decide el código a partir de la versión enviada, nunca el revisor:
 * agentes que escriben en el CRM, que envían mensajes externos sin aprobación o que pueden gastar dinero. (Un rechazo la necesita siempre;
 * eso lo impone la base.) Pura.
 */
import { obtenerHerramienta } from "../../agentes/herramientas/registro.ts";
import { HERRAMIENTAS_DE_MENSAJE } from "../../agentes/reglas/tipos.ts";
import type { ConfigVersion } from "../../certificacion/clonar.ts";

export function motivosSegundaOpinion(config: Pick<ConfigVersion, "herramientas">): string[] {
  const crm: string[] = [], envios: string[] = [], gasto: string[] = [];
  for (const t of config.herramientas) {
    if (t.permiso === "prohibida") continue;
    const h = obtenerHerramienta(t.tool_id);
    // Una herramienta que el registro no conoce se trata como sensible: ante la duda, segunda opinión.
    if (!h) { envios.push(t.tool_id); continue; }
    if (h.categoria === "crm" && h.sensibilidad !== "lectura") crm.push(t.tool_id);
    if ((h.sensibilidad === "envio_externo" || (HERRAMIENTAS_DE_MENSAJE as readonly string[]).includes(t.tool_id)) && t.permiso === "sola") envios.push(t.tool_id);
    if (h.sensibilidad === "gasto") gasto.push(t.tool_id);
  }
  const motivos: string[] = [];
  if (crm.length) motivos.push(`Escribe en el CRM (${crm.join(", ")}).`);
  if (envios.length) motivos.push(`Envía fuera de la empresa sin aprobación (${envios.join(", ")}).`);
  if (gasto.length) motivos.push(`Puede gastar dinero (${gasto.join(", ")}).`);
  return motivos;
}
