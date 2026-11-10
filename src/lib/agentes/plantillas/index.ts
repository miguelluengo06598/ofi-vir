/**
 * Registro de plantillas de IDESIE. Para añadir una: crea `<id>.ts` y añádela a la lista.
 * Pendientes de escribir (no existen todavía): marco-cierre, paula-reactivacion, leo-email, nora-contenido,
 * teo-anuncios, ada-analista, atlas-coordinador.
 */
import ivanCrm from "./ivan-crm.ts";
import luciaSdr from "./lucia-sdr.ts";
import saraWhatsapp from "./sara-whatsapp.ts";
import type { PlantillaAgente } from "./tipos.ts";

export const PLANTILLAS: readonly PlantillaAgente[] = Object.freeze([luciaSdr, saraWhatsapp, ivanCrm]);

export const obtenerPlantilla = (id: string): PlantillaAgente | undefined => PLANTILLAS.find((p) => p.id === id);
export type { PlantillaAgente } from "./tipos.ts";
