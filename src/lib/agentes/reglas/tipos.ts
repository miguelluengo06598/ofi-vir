import type { Horario, ReglasAgente } from "../instrucciones.ts";

export type Canal = "correo" | "whatsapp";

/**
 * Las herramientas que escriben a una persona de fuera de la empresa. Por aquí pasan los «mensajes externos» que cuentan para el
 * límite diario y el aviso de IA. Cualquier herramienta nueva que escriba a clientes debe añadirse aquí.
 */
export const CANALES_DE_HERRAMIENTA: Readonly<Record<string, { canal: Canal; campoTexto: string; campoDestino: string }>> = Object.freeze({
  redactar_correo: { canal: "correo", campoTexto: "cuerpo", campoDestino: "correo_del_contacto" },
  responder_whatsapp: { canal: "whatsapp", campoTexto: "mensaje", campoDestino: "telefono" },
});
export const HERRAMIENTAS_DE_MENSAJE = Object.freeze(Object.keys(CANALES_DE_HERRAMIENTA));
export const NOMBRE_CANAL: Record<Canal, string> = { correo: "correo", whatsapp: "WhatsApp" };

const L_V: [string, string][] = [["09:00", "18:00"]];
const HORARIO_DEFECTO: Horario = { lun: L_V, mar: L_V, mie: L_V, jue: L_V, vie: L_V };

/** Lo que vale si un agente no tiene fila en `agent_rules`. `idioma: "auto"` = el del mensaje recibido. */
export const REGLAS_POR_DEFECTO: Readonly<ReglasAgente> = Object.freeze({
  zonaHoraria: "Europe/Madrid", horario: HORARIO_DEFECTO, fueraDeHorario: "responder_y_avisar", mensajeFueraHorario: null,
  maxMensajesDia: null, topeCreditosMes: null, avisoIaTexto: null, idioma: "auto",
});

/** Aviso de IA si la empresa no ha configurado el suyo. */
export const AVISO_IA_POR_DEFECTO = "Soy un asistente de inteligencia artificial.";

export type TipoAvisoRegla = "limite_mensajes_agente" | "tope_creditos_agente";

/** Acceso a datos de las reglas. Toda operación recibe `companyId` (la clave de servicio se salta la RLS: cada consulta filtra a mano). */
export interface AlmacenReglas {
  /** null si el agente no tiene fila en `agent_rules` (se usan los valores por defecto). */
  reglasDe(companyId: string, agentId: string): Promise<ReglasAgente | null>;
  /** Créditos que ha consumido el agente desde `desde` (entero). */
  creditosConsumidosDesde(companyId: string, agentId: string, desde: Date): Promise<number>;
  /** Aviso a la empresa, UNO por agente y tipo desde `desde`. true si se creó, false si ya había uno. */
  avisarEmpresa(companyId: string, a: { agentId: string; tipo: TipoAvisoRegla; titulo: string; cuerpo: string; desde: Date }): Promise<boolean>;
}
