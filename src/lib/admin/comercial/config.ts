/**
 * Catálogos del área comercial y del alta de clientes. Sin dependencias de servidor: lo usan también los componentes.
 */
import type { RolPlataforma } from "@/lib/admin/acceso";

export const ROLES_COMERCIAL: readonly RolPlataforma[] = ["admin_samgple", "comercial_samgple"];

export const COLUMNAS = [
  { id: "nueva", titulo: "Nuevas" },
  { id: "contactada", titulo: "Contactadas" },
  { id: "demo_hecha", titulo: "Demo hecha" },
  { id: "alta_en_curso", titulo: "Alta en curso" },
  { id: "cliente", titulo: "Cliente" },
  { id: "descartada", titulo: "Descartadas" },
] as const;
export type EstadoSolicitud = (typeof COLUMNAS)[number]["id"];
export const ESTADOS_SOLICITUD = COLUMNAS.map((c) => c.id) as EstadoSolicitud[];
/** A «Cliente» solo se llega dando de alta (función alta_cliente), nunca arrastrando. */
export const ESTADOS_MOVIBLES: EstadoSolicitud[] = ["nueva", "contactada", "demo_hecha", "alta_en_curso", "descartada"];

export const TAMANOS = ["1-4", "5-20", "21-50", "51+"] as const;
export const SECTORES = ["Clínicas", "Academias", "Inmobiliarias", "Gimnasios", "E-commerce", "Reformas", "Otro"] as const;

/** Departamentos que se pueden montar (mismos slugs y orden que la oficina). */
export const DEPARTAMENTOS_ALTA = [
  { slug: "ventas", nombre: "Ventas", tipo: "ventas", orden: 1 },
  { slug: "atencion", nombre: "Atención al cliente", tipo: "atencion", orden: 2 },
  { slug: "marketing", nombre: "Marketing", tipo: "marketing", orden: 3 },
  { slug: "operaciones", nombre: "Operaciones · CRM", tipo: "operaciones", orden: 4 },
  { slug: "direccion", nombre: "Dirección", tipo: "direccion", orden: 5 },
] as const;
export type SlugDepartamentoAlta = (typeof DEPARTAMENTOS_ALTA)[number]["slug"];

export const SERVICIOS_ALTA = [
  { id: "implantacion", nombre: "Implantación", conImporte: true, periodicidad: "unico" },
  { id: "configuracion_departamentos", nombre: "Configuración de departamentos", conImporte: true, periodicidad: "unico" },
  { id: "agentes_a_medida", nombre: "Agentes a medida", conImporte: true, periodicidad: "unico" },
  { id: "gestion_mensual", nombre: "Gestión mensual", conImporte: true, periodicidad: "mensual" },
] as const;
export type ServicioAlta = (typeof SERVICIOS_ALTA)[number]["id"];

/** Caducidad por defecto del regalo de bienvenida (días). Un pack usa la suya. */
export const DIAS_REGALO_POR_DEFECTO = 90;
