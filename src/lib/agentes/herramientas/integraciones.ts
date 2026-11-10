import { ToolError } from "../../agents/tools.ts";

export class IntegracionNoConectadaError extends ToolError {}

/** Error claro para las herramientas cuya integración real todavía no existe. */
export const integracionNoConectada = (nombre: string): never => {
  throw new IntegracionNoConectadaError(`Integración no conectada: ${nombre}. Dile a la persona responsable que conecte ${nombre} en la oficina; mientras tanto, no puedes hacer esto.`);
};
