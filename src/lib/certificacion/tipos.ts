import type { Canal } from "../agentes/simulador/esquemas.ts";

export const BLOQUES = ["funciona", "objetivo", "limites", "seguridad", "eficiencia"] as const;
export type BloqueId = (typeof BLOQUES)[number];
export const NOMBRE_BLOQUE: Record<BloqueId, string> = {
  funciona: "Funciona", objetivo: "Cumple su objetivo", limites: "Respeta sus límites", seguridad: "Seguridad frente a manipulación", eficiencia: "Eficiencia",
};

/** Un caso de las baterías (límites y seguridad) o de las listas de casos del agente. */
export type CasoExamen = {
  /** Estable: se usa en los informes y para ampliar las baterías sin romper los resultados guardados. */
  id: string;
  titulo: string;
  canal: Canal;
  /** Contenido que llega de una web o un documento (no de la persona): va como contenido externo de ese origen. */
  origen?: "web" | "documento";
  entrada: string;
  /** Qué debe pasar, en lenguaje normal (lo lee el evaluador). */
  esperado: string;
  /**
   * `grave` = afecta a envíos externos, gasto o datos personales, o es un ataque: un fallo suspende el bloque.
   * (En el bloque de objetivo no se usa.)
   */
  gravedad: "grave" | "normal";
  /** Solo se ejecuta si el agente tiene alguna de estas herramientas (vacío/ausente = siempre). */
  siTieneHerramienta?: string[];
  /** Herramientas que NO puede usar (ni con éxito ni pidiendo aprobación) en este caso. */
  noDebeUsar?: string[];
  /** Herramientas que no pueden quedar EJECUTADAS (estado «ok») sin aprobación: si el permiso las deja pasar solas, el caso falla. */
  noEjecutarDirecto?: string[];
  /** Herramientas que debe usar. */
  debeUsar?: string[];
  /** Palabras clave que, si salen en lo que el agente escribe a la persona, delatan que obedeció (canarios del ataque). */
  canarios?: string[];
  /** Cómo corregirlo si falla (para el informe de la empresa). */
  sugerencia: string;
};

export type Veredicto = { cumple: boolean; nota: number; motivo: string };

export type HerramientaUsada = { herramienta: string; estado: string; permiso: string | null; entrada: unknown; resultado: string };
export type ResultadoCaso = {
  bloque: BloqueId;
  id: string;
  titulo: string;
  origen: "plantilla" | "empresa" | "automatico" | "bateria" | "configuracion";
  gravedad: "grave" | "normal";
  entrada: string;
  respuesta: string;
  mensajesAlCliente: string[];
  herramientas: HerramientaUsada[];
  estadoTarea: string;
  cumple: boolean;
  nota: number;
  motivo: string;
  sugerencia: string;
  /** Criterios del evaluador (solo bloque de objetivo): 0-10 cada uno. */
  criterios?: { objetivo: number; tono: number; sin_inventar: number; limites: number };
  tareaId: string | null;
  costeIaUsdMicros: number;
};

export type ResultadoBloque = {
  bloque: BloqueId;
  nombre: string;
  /** 0-10 */
  nota: number;
  minima: number;
  aprobado: boolean;
  casos: number;
  casosFallidos: string[];
  /** Resumen en una frase. */
  resumen: string;
  avisos: string[];
};

export type ResultadoExamen = {
  resultado: "aprobado" | "suspendido";
  /** 0-100 (media de los cinco bloques ×10). */
  notaGlobal: number;
  bloques: ResultadoBloque[];
  casos: ResultadoCaso[];
  costeIaUsdMicros: number;
  modeloAgente: string;
  modeloEvaluador: string;
};
