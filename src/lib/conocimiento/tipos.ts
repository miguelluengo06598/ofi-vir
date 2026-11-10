import { z } from "zod";

export const TIPOS_FUENTE = ["web", "documento", "faq", "texto"] as const;
export type TipoFuente = (typeof TIPOS_FUENTE)[number];
export type EstadoFuente = "procesando" | "listo" | "error";

export const MAX_FUENTES_POR_EMPRESA = 200;
export const MAX_PREGUNTAS_FAQ = 200;
export const MAX_CARACTERES_TEXTO_LIBRE = 200_000;
/** Un tope de fragmentos por fuente: cada uno cuesta un embedding. */
export const MAX_FRAGMENTOS_POR_FUENTE = 600;

export type Fuente = {
  id: string;
  companyId: string;
  /** null = toda la oficina. */
  agentId: string | null;
  tipo: TipoFuente;
  titulo: string;
  /** URL o nombre del archivo. */
  origen: string | null;
  estado: EstadoFuente;
  error: string | null;
  contenido: string | null;
  storagePath: string | null;
  bytes: number | null;
  fragmentos: number;
  paginas: number;
  avisos: string[];
  createdBy: string | null;
  creadoEn: string;
  iniciadoEn: string;
  procesadoEn: string | null;
};

export type NuevaFuente = Pick<Fuente, "id" | "agentId" | "tipo" | "titulo" | "origen" | "contenido" | "storagePath" | "bytes" | "createdBy">;

export interface AlmacenConocimiento {
  agenteExiste(companyId: string, agentId: string): Promise<boolean>;
  contar(companyId: string): Promise<number>;
  crear(companyId: string, f: NuevaFuente): Promise<Fuente>;
  obtener(companyId: string, id: string): Promise<Fuente | null>;
  /** Las de toda la oficina y, con `agentId`, las de ese agente. Sin `agentId`: todas las de la empresa. */
  listar(companyId: string, filtro?: { agentId?: string | null; soloOficina?: boolean }): Promise<Fuente[]>;
  /** Pasa a listo/error (solo si sigue «procesando»). false si la fuente ya no existe o ya no está procesando. */
  terminar(companyId: string, id: string, r: { estado: "listo"; fragmentos: number; paginas: number; avisos: string[] } | { estado: "error"; error: string; avisos?: string[] }): Promise<boolean>;
  /** Vuelve a «procesando» desde «error» o desde un «procesando» abandonado. false si no se pudo. */
  reiniciar(companyId: string, id: string, antiguaDespuesDeMs: number): Promise<Fuente | null>;
  /** Borra la fuente (sus fragmentos caen en cascada en la base). Devuelve la fuente borrada. */
  borrar(companyId: string, id: string): Promise<Fuente | null>;
  subirArchivo(ruta: string, bytes: Uint8Array, tipoMime: string): Promise<void>;
  leerArchivo(ruta: string): Promise<Uint8Array | null>;
  borrarArchivo(ruta: string): Promise<void>;
}

// ---- Peticiones (zod estricto: nada de `companyId` ni campos de más) --------------------------------------------------------
const titulo = z.string().trim().min(1).max(200);
const agenteId = z.uuid().nullable().optional();

export const PeticionWebSchema = z.strictObject({ tipo: z.literal("web"), url: z.string().trim().min(8).max(2000), titulo: titulo.optional(), agenteId });
export const PeticionTextoSchema = z.strictObject({ tipo: z.literal("texto"), titulo, texto: z.string().trim().min(20).max(MAX_CARACTERES_TEXTO_LIBRE), agenteId });
export const PreguntaSchema = z.strictObject({ pregunta: z.string().trim().min(3).max(300), respuesta: z.string().trim().min(1).max(4000) });
export const PeticionFaqSchema = z.strictObject({ tipo: z.literal("faq"), titulo, preguntas: z.array(PreguntaSchema).min(1).max(MAX_PREGUNTAS_FAQ), agenteId });
export const PeticionJsonSchema = z.discriminatedUnion("tipo", [PeticionWebSchema, PeticionTextoSchema, PeticionFaqSchema]);
export type PeticionJson = z.infer<typeof PeticionJsonSchema>;
