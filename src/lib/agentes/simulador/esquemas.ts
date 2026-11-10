import { z } from "zod";

export const CANALES = ["whatsapp", "correo", "interno"] as const;
export type Canal = (typeof CANALES)[number];

export const MensajeHistorialSchema = z.object({ rol: z.enum(["persona", "agente"]), texto: z.string().trim().min(1).max(2000) }).strict();
export type MensajeHistorial = z.infer<typeof MensajeHistorialSchema>;

/** POST /api/agentes/[id]/simular. Estricto: un `companyId` (o cualquier otro campo) se rechaza. */
export const PeticionSimularSchema = z.object({
  mensaje: z.string().trim().min(1).max(4000),
  canal: z.enum(CANALES),
  historial: z.array(MensajeHistorialSchema).max(20).optional(),
}).strict();
export type PeticionSimular = z.infer<typeof PeticionSimularSchema>;

/** POST /api/agentes/[id]/simular/casos. Sin cuerpo útil: se pueden indicar casos concretos. */
export const PeticionCasosSchema = z.object({ casos: z.array(z.string().min(1).max(100)).max(50).optional() }).strict();
