import type { Permiso } from "../herramientas/tipos.ts";

/**
 * Una plantilla de agente de IDESIE, como código. Vive en git y se revisa como cualquier cambio.
 * `npm run plantillas:sync` la copia a la tabla `agent_templates`. La `version` NO se escribe aquí: la sube el
 * script cuando cambia el contenido, y cada versión nueva queda «pendiente de certificar» hasta que IDESIE la certifique.
 *
 * Para añadir una plantilla nueva (marco-cierre, paula-reactivacion, leo-email, nora-contenido, teo-anuncios,
 * ada-analista, atlas-coordinador): crea `<id>.ts` con `export default definirPlantilla({...})` y añádela a `index.ts`.
 */
export type TipoDepartamento = "ventas" | "atencion" | "marketing" | "operaciones" | "direccion" | "personalizado";
export type TipoTarea = "simple" | "estandar" | "experta";

export type HerramientaDePlantilla = {
  id: string;
  permisoDefecto: Permiso;
  /** ¿Puede la empresa cambiar el permiso de esta herramienta en su agente? */
  editable: boolean;
};

/** Un caso para el simulador y para los tests: qué entra y cómo debe comportarse el agente. */
export type CasoDePrueba = {
  /** Identificador corto y estable (p. ej. «lead-nuevo-web»). */
  id: string;
  titulo: string;
  /** Lo que recibe el agente: un mensaje, un correo, un traspaso… */
  entrada: string;
  /** Comportamiento esperado, en lenguaje normal (lo lee una persona en el simulador). */
  esperado: string;
  /** Herramientas que DEBE usar (comprobable automáticamente en el simulador). */
  debeUsar?: string[];
  /** Herramientas que NO puede usar en este caso. */
  noDebeUsar?: string[];
};

export type PlantillaAgente = {
  id: string;
  nombrePorDefecto: string;
  rol: string;
  departamentoTipo: TipoDepartamento;
  /** Texto que ve la empresa al elegir plantilla. */
  descripcionPublica: string;
  /** Lista que ve la empresa: qué hace. */
  queHace: string[];
  /** Lista que ve la empresa: qué no hace. */
  queNoHace: string[];
  /** PROTEGIDAS: solo las lee el servidor. La empresa nunca las ve. */
  instruccionesBase: string;
  herramientas: HerramientaDePlantilla[];
  integracionesRequeridas: string[];
  tipoTareaPorDefecto: TipoTarea;
  casosDePrueba: CasoDePrueba[];
  /** Resumen de lo que cambia en esta versión respecto a la anterior: lo ve la empresa al ofrecerle actualizar su agente. */
  novedades?: string;
  /**
   * Trabajo periódico que la plantilla SUGIERE (p. ej. un informe semanal). Nunca se crea ni se activa solo: la empresa lo ve como
   * «rutina sugerida» y, si quiere, la añade (desactivada) y la activa ella, viendo su coste al mes. No cuenta para la huella.
   */
  rutinasSugeridas?: RutinaSugerida[];
};

export type RutinaSugerida = {
  /** Id estable dentro de la plantilla (la rutina añadida guarda «plantilla:<plantilla>:<id>»). */
  id: string;
  nombre: string;
  descripcion: string;
  /** Lo que se le pide al agente en cada ejecución. */
  instruccion: string;
  tipoTarea: TipoTarea;
  frecuencia: "cada_hora" | "diaria" | "laborables" | "semanal" | "mensual";
  maxEjecucionesMes: number;
};

/** Solo para que el tipo se compruebe al escribir la plantilla. */
export const definirPlantilla = (p: PlantillaAgente): PlantillaAgente => p;
