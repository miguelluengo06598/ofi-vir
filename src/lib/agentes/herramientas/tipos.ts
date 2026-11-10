import type { z } from "zod";
import type { ConsumoFijoId } from "../../creditos/tarifas.ts";
import type { ToolContext } from "../../agents/tools.ts";

export const CATEGORIAS = ["memoria", "comunicacion", "crm", "agenda", "anuncios", "interna"] as const;
export type Categoria = (typeof CATEGORIAS)[number];

export const SENSIBILIDADES = ["lectura", "escritura", "envio_externo", "gasto", "borrado"] as const;
export type Sensibilidad = (typeof SENSIBILIDADES)[number];

export const PERMISOS = ["sola", "aprobacion", "humano", "prohibida"] as const;
export type Permiso = (typeof PERMISOS)[number];

/** Permiso por defecto de una herramienta según su sensibilidad (única fuente de esa regla). */
export const PERMISO_POR_SENSIBILIDAD: Readonly<Record<Sensibilidad, Permiso>> = Object.freeze({
  lectura: "sola",
  escritura: "sola",
  envio_externo: "aprobacion",
  gasto: "aprobacion",
  borrado: "aprobacion",
});

/** Cómo terminó una llamada (lo que se registra en `tool_calls.resultado`). */
export type ResultadoLlamada =
  | "ok" | "error" | "no_disponible" | "integracion_no_conectada" | "pendiente_aprobacion" | "aprobada" | "rechazada"
  | "limite" | "entrada_invalida" | "salida_invalida" | "pasada_a_humano" | "bloqueada";

// ── Acceso a datos del ejecutor ────────────────────────────────────────────────────────────────────
export type LlamadaRegistrada = {
  taskId: string | null;
  agentId: string;
  toolId: string;
  entradaResumen: string;
  resultado: ResultadoLlamada;
  detalle: string;
  permiso: Permiso | null;
  duracionMs: number;
  approvalId: string | null;
  esSimulacion: boolean;
};

export type TraspasoConfigurado = { agenteDestinoId: string; agenteDestinoNombre: string; agenteDestinoSlug: string; condicion: string; tipoTraspaso: string };

export type NuevoTraspaso = {
  fromAgentId: string; toAgentId: string; tipo: "lead" | "cita" | "incidencia" | "datos" | "otro"; kind: "lead" | "aviso" | "peticion" | "informe";
  summary: string; card: { label: string; value: string }[]; ficha: Record<string, string | number>; fichaHash: string; contactId: string | null;
  originTaskId: string | null; instruccion: string; creditos: number; maxCadena: number;
};
export type ResultadoTraspaso =
  | { resultado: "creado"; handoffId: string; chainId: string; posicion: number; taskId: string; toAgentName: string }
  | { resultado: "bucle" | "limite"; motivo: string; chainId: string };

/** Toda operación recibe `companyId`: el servidor usa la clave de servicio (sin RLS), así que cada consulta filtra por empresa. */
export interface AlmacenHerramientas {
  /** Permiso y límite diario de una herramienta para un agente; null si el agente no la tiene. */
  herramientaDeAgente(companyId: string, agentId: string, toolId: string): Promise<{ permiso: Permiso; limiteDiario: number | null } | null>;
  herramientasDeAgente(companyId: string, agentId: string): Promise<{ toolId: string; permiso: Permiso; limiteDiario: number | null }[]>;
  integracionConectada(companyId: string, proveedor: string): Promise<boolean>;
  /** Llamadas reales (no simuladas) que ya se hicieron o están pendientes desde `desde`. */
  contarLlamadasDesde(companyId: string, agentId: string, toolId: string, desde: Date): Promise<number>;
  registrarLlamada(companyId: string, l: LlamadaRegistrada): Promise<void>;

  crearAprobacion(companyId: string, a: { agentId: string; kind: "spend" | "other"; titulo: string; detalle: string; payload: Record<string, unknown> }): Promise<string>;
  leerAprobacion(companyId: string, approvalId: string): Promise<{ status: "pending" | "approved" | "rejected"; agentId: string; payload: Record<string, unknown> } | null>;
  /** La llamada que quedó pendiente de esa aprobación (la fuente de verdad de qué herramienta y de qué agente era). */
  llamadaPendiente(companyId: string, approvalId: string): Promise<{ toolId: string; agentId: string; taskId: string | null } | null>;
  /** Marca la aprobación como usada. false si ya se había usado (así no se ejecuta dos veces). */
  consumirAprobacion(companyId: string, c: { approvalId: string; agentId: string; taskId: string | null; toolId: string; decision: "aprobada" | "rechazada" }): Promise<boolean>;

  crearTareaHumana(companyId: string, t: { agentId: string; taskId: string | null; contactId: string | null; titulo: string; contexto: string; urgencia: "baja" | "normal" | "alta" }): Promise<string>;
  traspasosConfigurados(companyId: string, agentIdOrigen: string): Promise<TraspasoConfigurado[]>;
  /**
   * Crea el traspaso, la tarea del agente destino y cobra su crédito, todo a la vez. Solo a destinos configurados y activos de la misma empresa.
   * Con bucle o límite de cadena NO crea nada y devuelve el motivo (la cadena se corta y se avisa a la empresa). Sin saldo lanza `ToolError`.
   */
  crearTraspasoDirecto(companyId: string, h: NuevoTraspaso): Promise<ResultadoTraspaso>;
}

/**
 * Secretos de integraciones (tokens OAuth). Solo el servidor los obtiene, a partir de `companyId`. Todo valor que se
 * entregue queda anotado para poder borrarlo de cualquier cosa que vaya a Claude.
 */
export class GestorSecretos {
  private readonly leer: (companyId: string, proveedor: string) => Promise<string | null>;
  private readonly companyId: string;
  private readonly entregados = new Set<string>();
  constructor(companyId: string, leer: (companyId: string, proveedor: string) => Promise<string | null>) {
    this.companyId = companyId;
    this.leer = leer;
  }
  async token(proveedor: string): Promise<string | null> {
    const t = await this.leer(this.companyId, proveedor);
    if (t) this.entregados.add(t);
    return t;
  }
  /** Quita de un texto cualquier secreto entregado en esta ejecución. */
  redactar(texto: string): string {
    let out = texto;
    for (const s of this.entregados) if (s.length >= 6) out = out.split(s).join("[secreto]");
    return out;
  }
}

/**
 * Lo que deciden las reglas sobre una llamada: `null` = seguir; un texto = bloquear con ese motivo; o un objeto:
 * - `bloquear`: no se ejecuta (se le cuenta el motivo a la IA).
 * - `entrada`: la entrada que se usa en su lugar (p. ej. el mensaje con el aviso de IA añadido). Es lo que ve quien aprueba y lo que se ejecuta.
 * - `forzarAprobacion`: aunque el permiso sea «sola», esta llamada necesita aprobación (con ese motivo).
 * - `alTerminarBien`: se llama solo si la herramienta terminó bien (p. ej. para anotar en la memoria que ya se avisó de que es una IA).
 */
export type DecisionReglas = string | null | {
  bloquear?: string;
  entrada?: unknown;
  forzarAprobacion?: string;
  alTerminarBien?: () => Promise<void>;
};

/** Contexto de ejecución: el de las herramientas del motor, más lo que necesita el catálogo. Nada de esto llega a Claude. */
export type ContextoEjecucion = ToolContext & {
  almacen: AlmacenHerramientas;
  secretos: GestorSecretos;
  /** true = simulador: se llama a `simular`, no se toca nada real (ni aprobaciones, ni tareas, ni créditos). */
  esSimulacion: boolean;
  ahora?: () => Date;
  /**
   * Reglas del agente (horario, límite de mensajes, tope de créditos, aviso de IA…). Se llaman justo antes de ejecutar, tras comprobar
   * permisos e integración. Mira `crearReglasDelEjecutor` (reglas/servicio.ts). Un texto = bloquear la llamada con ese motivo.
   */
  reglas?: (ctx: ContextoEjecucion, herramienta: Herramienta, entrada: unknown, op: { aprobada: boolean }) => Promise<DecisionReglas>;
};

export type Herramienta<E extends z.ZodType = z.ZodType, S extends z.ZodType = z.ZodType> = {
  id: string;
  /** Nombre que ve la empresa. */
  nombre: string;
  /** Descripción para Claude: clara y corta. */
  descripcionClaude: string;
  /** Descripción para la empresa, en lenguaje normal. */
  descripcionEmpresa: string;
  entrada: E;
  salida: S;
  categoria: Categoria;
  sensibilidad: Sensibilidad;
  /** Derivado de la sensibilidad (ver PERMISO_POR_SENSIBILIDAD). */
  permisoDefecto: Permiso;
  /** Proveedor de `company_connections` que necesita, o null. */
  integracion: string | null;
  /**
   * Consumo fijo de créditos que genera por sí misma (ver CONSUMOS_FIJOS en creditos/tarifas.ts), o null.
   * El ejecutor solo lo declara: lo cobra el servicio de créditos. El correo se cobra al ENVIARSE, no al redactarlo.
   */
  costeCreditos: ConsumoFijoId | null;
  /** La herramienta ya crea su propia aprobación (redactar_correo, pedir_aprobacion): no hace falta otra encima. */
  creaSuPropiaAprobacion?: boolean;
  /** Tras ejecutarla, la tarea queda en espera de una persona. */
  pausaTarea?: boolean;
  /** Escalar a una persona es seguro: se permite incluso en una tarea marcada como sospechosa (que por lo demás solo puede leer). */
  permitidaEnTareaSospechosa?: boolean;
  /** Lo que devuelve viene de fuera (CRM, anuncios, agenda): se entrega a Claude marcado como datos, nunca instrucciones. */
  datosExternos?: boolean;
  /** Texto que ve la persona que aprueba. */
  vistaPrevia?(entrada: z.output<E>): string;
  ejecutar(ctx: ContextoEjecucion, entrada: z.output<E>): Promise<z.output<S>>;
  /** Datos ficticios coherentes con la entrada. No toca nada real. */
  simular(ctx: ContextoEjecucion, entrada: z.output<E>): z.output<S> | Promise<z.output<S>>;
  /** Cómo se le cuenta a Claude el resultado (por defecto: el texto tal cual o el JSON). */
  aTexto?(salida: z.output<S>): string;
};

/** Define una herramienta: calcula el permiso por defecto a partir de la sensibilidad. */
export const definir = <E extends z.ZodType, S extends z.ZodType>(d: Omit<Herramienta<E, S>, "permisoDefecto">): Herramienta<E, S> => ({
  ...d,
  permisoDefecto: PERMISO_POR_SENSIBILIDAD[d.sensibilidad],
});
