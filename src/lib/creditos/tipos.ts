/** Forma de las respuestas de /api/creditos/* tal como las recibe la interfaz. Módulo puro (sin servidor): se importa desde el cliente. */
import { TIPOS_DE_TAREA, creditosParaTarea, type TipoDeTareaId } from "./tarifas";

export type EstadoOficina = "activa" | "saldo_bajo" | "sin_saldo" | "pausada" | "pendiente_borrado";

export type LoteVivo = {
  id?: string;
  origen?: string;
  creditosIniciales?: number;
  creditosRestantes: number;
  caducaEn: string;
};

export type PackVista = {
  id: string; nombre: string; creditos: number; creditosBonoMensual: number | null; diasCaducidad: number;
  importeCentimos: number; ivaCentimos: number; totalCentimos: number; disponible: boolean;
};

export type ResumenCreditos = {
  estadoOficina: { estado: EstadoOficina; puedeEjecutarAgentes: boolean };
  saldo: { disponible: number; reservado: number; enLotes: number; consumidosEsteMes: number };
  lotes: LoteVivo[];
  consumoMes: {
    total: number;
    porAgente: { agenteId: string | null; nombre: string; creditos: number }[];
    porDepartamento: { departamentoId: string | null; nombre: string; creditos: number }[];
    porTipoDeTarea: { concepto: string; tipo: string | null; creditos: number }[];
  };
  rutinas: {
    activas: number; costeMensualEstimado: number;
    detalle: { id: string; nombre: string; agenteId: string; tipoTarea: TipoDeTareaId; frecuencia: string; costeMensualEstimado: number }[];
  };
  ajustes: {
    topeMensualCreditos: number | null;
    recargaAuto: { activa: boolean; umbral: number | null; packId: string | null };
    bonoMensualPackId: string | null;
    bonoProximaRenovacionEn: string | null;
    pruebaUsada: boolean;
  };
  packs: PackVista[];
};

export type Movimiento = {
  id: string; tipo: "compra" | "consumo" | "caducidad" | "ajuste" | "reembolso"; creditos: number; concepto: string;
  agente: string | null; creadoEn: string; saldoResultante: number | null;
};

/** 1 crédito = 1 céntimo. */
export const creditosAEur = (creditos: number) => creditos / 100;

/** «≈ N tareas» de tipo estándar. */
export const tareasEstandar = (creditos: number) => Math.floor(creditos / creditosParaTarea("estandar"));

export const ESTADOS_OFICINA: Record<EstadoOficina, { etiqueta: string; significa: string; hacer: string; tono: "ok" | "aviso" | "error" | "neutro" }> = {
  activa: { etiqueta: "Activa", significa: "Tus agentes y rutinas trabajan con normalidad.", hacer: "No tienes que hacer nada.", tono: "ok" },
  saldo_bajo: { etiqueta: "Saldo bajo", significa: "Te queda poco saldo; los agentes siguen trabajando.", hacer: "Compra un pack o activa la recarga automática para que no se detengan.", tono: "aviso" },
  sin_saldo: { etiqueta: "Sin saldo", significa: "Modo mínimo: los agentes no ejecutan tareas ni rutinas. El correo entrante sigue llegando.", hacer: "Compra un pack para reactivar la oficina.", tono: "error" },
  pausada: { etiqueta: "Pausada", significa: "Llevas mucho tiempo sin actividad y la oficina está pausada.", hacer: "Compra créditos para reactivarla.", tono: "error" },
  pendiente_borrado: { etiqueta: "Pendiente de borrado", significa: "La oficina lleva demasiado tiempo pausada y sus datos se borrarán pronto.", hacer: "Compra créditos ya para cancelar el borrado.", tono: "error" },
};

export const NOMBRE_TIPO_TAREA: Record<TipoDeTareaId, string> = { simple: "Simple", estandar: "Estándar", experta: "Experta" };
export const creditosDeTipo = (t: TipoDeTareaId) => TIPOS_DE_TAREA[t].creditos;

export const NOMBRE_FRECUENCIA: Record<string, string> = {
  cada_hora: "cada hora", diaria: "cada día", laborables: "en días laborables", semanal: "cada semana", mensual: "cada mes",
};
