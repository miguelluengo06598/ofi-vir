/**
 * Implantación (puesta en marcha): catálogos y validación de plantillas. Sin dependencias de servidor: lo usan también la
 * interfaz de MyOfia y la del cliente. Los mismos catálogos están como restricciones en la base
 * (20261114000000_implantacion.sql): si se añade uno, hay que añadirlo en los dos sitios.
 */
import { z } from "zod";
import type { RolPlataforma } from "../acceso.ts";

/** Quién ve /admin/implantacion (admin_samgple siempre). Debe coincidir con la zona de src/proxy.ts. */
export const ROLES_IMPLANTACION: RolPlataforma[] = ["implantacion_samgple", "comercial_samgple", "soporte_samgple"];
/** Quién cambia tareas y edita plantillas (además de admin_samgple). */
export const ROLES_EDITAR_IMPLANTACION: RolPlataforma[] = ["implantacion_samgple"];
export const puedeEditarImplantacion = (roles: readonly RolPlataforma[]) => roles.includes("admin_samgple") || roles.some((r) => ROLES_EDITAR_IMPLANTACION.includes(r));

export const COMPROBACIONES = [
  { id: "invitacion_aceptada", nombre: "El propietario aceptó la invitación", ambito: "empresa" },
  { id: "datos_fiscales", nombre: "Datos fiscales completos", ambito: "empresa" },
  { id: "conexion", nombre: "Conexión hecha", ambito: "integracion" },
  { id: "conocimiento", nombre: "Hay al menos una fuente de conocimiento lista", ambito: "empresa" },
  { id: "agente_probado", nombre: "El agente se probó en el simulador", ambito: "agente" },
  { id: "agente_enviado", nombre: "El agente se envió a certificación", ambito: "agente" },
  { id: "agente_certificado", nombre: "El agente está certificado", ambito: "agente" },
  { id: "agente_activo", nombre: "El agente está activo", ambito: "agente" },
] as const;
export type Comprobacion = (typeof COMPROBACIONES)[number]["id"];

/** Botones directos que ve el cliente en «Puesta en marcha». */
export const ACCIONES = [
  { id: "aceptar_invitacion", nombre: "Aceptar la invitación" },
  { id: "datos_fiscales", nombre: "Rellenar datos fiscales" },
  { id: "conectar", nombre: "Ir a Conexiones" },
  { id: "conocimiento", nombre: "Subir conocimiento" },
  { id: "aprobar_agente", nombre: "Revisar y aprobar el agente" },
] as const;
export type Accion = (typeof ACCIONES)[number]["id"];

export const AMBITOS = [
  { id: "empresa", nombre: "Una vez por empresa" },
  { id: "agente", nombre: "Una por agente ({agente})" },
  { id: "integracion", nombre: "Una por integración que necesitan sus agentes ({integracion})" },
] as const;

export const NOMBRE_ESTADO_TAREA: Record<string, string> = { pendiente: "Pendiente", en_curso: "En curso", hecha: "Hecha", descartada: "Descartada" };

const Clave = z.string().regex(/^[a-z0-9_]{2,40}$/, "La clave va en minúsculas, números y guiones bajos (2-40).");

export const TareaPlantillaSchema = z.object({
  clave: Clave,
  titulo: z.string().trim().min(2, "Cada tarea necesita un título.").max(200),
  para: z.enum(["samgple", "cliente"]),
  ambito: z.enum(["empresa", "agente", "integracion"]),
  proveedor: z.string().regex(/^[a-z0-9_]{2,40}$/).nullable(),
  obligatoria: z.boolean(),
  dias_objetivo: z.number().int().min(0).max(365),
  ayuda: z.string().trim().max(300).nullable(),
  comprobacion: z.enum(COMPROBACIONES.map((c) => c.id) as [Comprobacion, ...Comprobacion[]]).nullable(),
  accion: z.enum(ACCIONES.map((a) => a.id) as [Accion, ...Accion[]]).nullable(),
  depende_de: z.array(Clave).max(20),
}).strict();
export type TareaPlantilla = z.infer<typeof TareaPlantillaSchema>;

export const PlantillaSchema = z.object({
  nombre: z.string().trim().min(2, "Ponle nombre a la plantilla.").max(120),
  descripcion: z.string().trim().max(1000).nullable(),
  por_defecto: z.boolean(),
  activa: z.boolean(),
  tareas: z.array(TareaPlantillaSchema).min(1, "La plantilla necesita al menos una tarea.").max(80),
}).strict();
export type Plantilla = z.infer<typeof PlantillaSchema>;

/** Las reglas que también impone la base, con mensajes que se entienden. Devuelve el primer problema o null. */
export function problemaDePlantilla(p: Plantilla): string | null {
  if (p.por_defecto && !p.activa) return "La plantilla por defecto tiene que estar activa.";
  const vistas = new Set<string>();
  for (const t of p.tareas) {
    if (vistas.has(t.clave)) return `La clave «${t.clave}» está repetida.`;
    for (const d of t.depende_de) {
      if (d === t.clave) return `«${t.titulo}» no puede depender de sí misma.`;
      if (!vistas.has(d)) return `«${t.titulo}» depende de «${d}», que no existe o va después. Ordena las tareas para que cada una vaya tras las que necesita.`;
    }
    vistas.add(t.clave);
    if (t.proveedor && t.ambito !== "empresa") return `«${t.titulo}»: una integración fija solo vale en tareas de empresa.`;
    if (t.comprobacion === "conexion" && t.ambito !== "integracion" && !t.proveedor) return `«${t.titulo}»: para comprobar una conexión, la tarea debe ser por integración o indicar cuál.`;
    if (t.comprobacion && COMPROBACIONES.find((c) => c.id === t.comprobacion)?.ambito === "agente" && t.ambito !== "agente") return `«${t.titulo}»: esa comprobación es de un agente; la tarea debe ser «una por agente».`;
    if (t.accion === "aprobar_agente" && (t.ambito !== "agente" || t.para !== "cliente")) return `«${t.titulo}»: «aprobar el agente» es una tarea del cliente y por agente.`;
    if (t.ambito === "agente" && !t.titulo.includes("{agente}")) return `«${t.titulo}»: las tareas por agente llevan {agente} en el título.`;
    if (t.ambito === "integracion" && !t.titulo.includes("{integracion}")) return `«${t.titulo}»: las tareas por integración llevan {integracion} en el título.`;
  }
  return null;
}

/** Botón directo para una tarea del cliente en su oficina (null si no hay a dónde ir). */
export function destinoDeAccion(accion: string | null, t: { agentId: string | null }): { href: string; texto: string } | null {
  switch (accion) {
    case "datos_fiscales": return { href: "#datos-fiscales", texto: "Rellenar ahora" };
    case "conectar": return { href: "/conexiones", texto: "Ir a Conexiones" };
    case "conocimiento": return { href: "/agentes", texto: "Subir conocimiento" };
    // La vista de agentes aún no abre una ficha concreta por URL: se va a la lista y se aprueba desde aquí.
    case "aprobar_agente": void t; return { href: "/agentes", texto: "Probar el agente" };
    default: return null;
  }
}
