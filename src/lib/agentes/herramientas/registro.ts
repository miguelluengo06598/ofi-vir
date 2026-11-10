/**
 * Registro central de herramientas: cada una se define UNA sola vez (en el archivo de su categoría) y aquí se reúnen.
 * Todo lo demás (ejecutor, simulador, interfaz de permisos, lo que se le ofrece a Claude) lee de este registro.
 */
import { z } from "zod";
import type { LlmTool } from "../../agents/llm.ts";
import { HERRAMIENTAS_AGENDA } from "./agenda.ts";
import { HERRAMIENTAS_ANUNCIOS } from "./anuncios.ts";
import { HERRAMIENTAS_COMUNICACION } from "./comunicacion.ts";
import { HERRAMIENTAS_CRM } from "./crm.ts";
import { HERRAMIENTAS_DEMO } from "./demo.ts";
import { HERRAMIENTAS_INTERNAS } from "./interna.ts";
import { HERRAMIENTAS_MEMORIA } from "./memoria.ts";
import type { Herramienta } from "./tipos.ts";

export const REGISTRO: readonly Herramienta[] = Object.freeze([
  ...HERRAMIENTAS_MEMORIA,
  ...HERRAMIENTAS_COMUNICACION,
  ...HERRAMIENTAS_CRM,
  ...HERRAMIENTAS_AGENDA,
  ...HERRAMIENTAS_ANUNCIOS,
  ...HERRAMIENTAS_INTERNAS,
  ...HERRAMIENTAS_DEMO,
] as Herramienta[]);

const POR_ID = new Map(REGISTRO.map((h) => [h.id, h]));
if (POR_ID.size !== REGISTRO.length) throw new Error("Hay dos herramientas con el mismo id en el registro.");

export const obtenerHerramienta = (id: string): Herramienta | undefined => POR_ID.get(id);

/** Esquema de entrada en JSON Schema, tal como lo pide la API de Claude. */
export function jsonSchemaDeEntrada(h: Herramienta): Record<string, unknown> {
  const { $schema: _omit, ...schema } = z.toJSONSchema(h.entrada) as Record<string, unknown>;
  void _omit;
  return schema;
}

/** Definición de la herramienta en el formato de tool use de la API de Claude. */
export const comoHerramientaDeClaude = (h: Herramienta): LlmTool => ({ name: h.id, description: h.descripcionClaude, input_schema: jsonSchemaDeEntrada(h) });

/** Ficha pública de una herramienta (lo que ve la empresa; sin funciones ni esquemas). */
export const fichaPublica = (h: Herramienta) => ({
  id: h.id, nombre: h.nombre, descripcion: h.descripcionEmpresa, categoria: h.categoria, sensibilidad: h.sensibilidad,
  permisoDefecto: h.permisoDefecto, integracion: h.integracion, costeCreditos: h.costeCreditos,
});
