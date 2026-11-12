/**
 * Registro de plantillas de IDESIE. Para añadir una: crea `<id>.ts` y añádela a la lista.
 */
import adaAnalista from "./ada-analista.ts";
import atlasCoordinador from "./atlas-coordinador.ts";
import leoEmail from "./leo-email.ts";
import marcoCierre from "./marco-cierre.ts";
import noraContenido from "./nora-contenido.ts";
import paulaReactivacion from "./paula-reactivacion.ts";
import teoAnuncios from "./teo-anuncios.ts";
import ivanCrm from "./ivan-crm.ts";
import luciaSdr from "./lucia-sdr.ts";
import saraWhatsapp from "./sara-whatsapp.ts";
import type { PlantillaAgente } from "./tipos.ts";

export const PLANTILLAS: readonly PlantillaAgente[] = Object.freeze([
  luciaSdr, saraWhatsapp, ivanCrm, marcoCierre, paulaReactivacion, leoEmail, noraContenido, teoAnuncios, adaAnalista, atlasCoordinador,
]);

export const obtenerPlantilla = (id: string): PlantillaAgente | undefined => PLANTILLAS.find((p) => p.id === id);
export type { PlantillaAgente } from "./tipos.ts";
