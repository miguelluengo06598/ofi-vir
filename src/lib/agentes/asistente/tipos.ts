import type { LlmUsage } from "../../agents/llm.ts";
import type { Permiso } from "../herramientas/tipos.ts";
import type { MensajeSesion, Propuesta } from "./esquemas.ts";

/** Lo que el asistente puede saber de un agente. NO existe ningún campo para las instrucciones base de la plantilla. */
export type ContextoAgente = {
  agente: {
    id: string; companyId: string; departmentId: string; nombre: string; rol: string; estado: string; versionActual: number; templateId: string | null;
    negocioResumen: string; tono: string; objetivo: string; nuncaHace: string; instruccionesEmpresa: string;
  };
  /** Solo la parte pública de la plantilla. */
  plantilla: null | { id: string; nombre: string; descripcionPublica: string; queHace: string; queNoHace: string };
  /** Herramientas que se pueden configurar: las de la plantilla (con su regla de edición) o, en un agente propio, todo el catálogo. */
  herramientas: {
    id: string; nombre: string; descripcion: string; sensibilidad: string; integracion: string | null;
    permisoDefecto: Permiso; editable: boolean; permisoActual: Permiso | null;
  }[];
  reglas: { zonaHoraria: string; horario: Record<string, string[][]>; fueraDeHorario: string; mensajeFueraHorario: string | null; idioma: string };
  otrosAgentes: { id: string; nombre: string; rol: string; departamento: string }[];
  traspasosActuales: { destinoId: string; destinoNombre: string; condicion: string; tipo: string }[];
  conocimiento: { titulo: string; tipo: string; estado: string }[];
};

export type SesionAsistente = {
  id: string; companyId: string; agentId: string; mensajes: MensajeSesion[]; propuestaActual: unknown | null; versionBase: number; estado: "abierta" | "aplicada";
};

export type CosteAsistente = {
  taskId: string; companyId: string; agentId: string; modelo: string; uso: LlmUsage; costeIaUsdMicros: number; creditosCobrados: number;
};

export type CambiosAplicar = {
  ficha?: Partial<Record<"negocio_resumen" | "tono" | "objetivo" | "nunca_hace" | "instrucciones_empresa", string>>;
  reglas?: Propuesta["reglas"];
  permisos?: { tool_id: string; permiso: Permiso }[];
  traspasos?: { agent_id_destino: string; condicion: string; tipo_traspaso: string }[];
};

export type ResultadoAplicar = { version: number; permisosAplicados: number; traspasosCreados: number };

/** Acceso a datos del asistente (la implementación de Supabase filtra siempre por `company_id`). */
export interface AlmacenAsistente {
  cargarContexto(companyId: string, agentId: string): Promise<ContextoAgente | null>;
  cargarSesion(companyId: string, agentId: string, sesionId: string): Promise<SesionAsistente | null>;
  guardarSesion(s: { id?: string; companyId: string; agentId: string; userId: string; mensajes: MensajeSesion[]; propuesta: Propuesta; versionBase: number }): Promise<string>;
  registrarCoste(c: CosteAsistente): Promise<void>;
  aplicar(p: { companyId: string; agentId: string; userId: string; sesionId: string; versionEsperada: number; cambios: CambiosAplicar; motivo: string }): Promise<ResultadoAplicar>;
}
