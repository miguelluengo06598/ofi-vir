/**
 * Configuración de la ficha de clientes de SAMGPLE (/admin/clientes). Sin dependencias de servidor: la importan también los
 * componentes para mostrar u ocultar botones (la decisión real la vuelve a tomar el servidor en cada acción).
 */
import type { RolPlataforma } from "../acceso.ts";

/** Quién puede ver /admin/clientes (admin_samgple entra siempre). Debe coincidir con la zona de src/proxy.ts. */
export const ROLES_CLIENTES: RolPlataforma[] = ["comercial_samgple", "implantacion_samgple", "soporte_samgple", "finanzas_samgple"];

/** Qué rol (además de admin_samgple, que puede todo) hace cada acción. */
export const ROLES_ACCION = {
  editarFicha: ["comercial_samgple", "implantacion_samgple", "soporte_samgple", "finanzas_samgple"],
  anotar: ["comercial_samgple", "implantacion_samgple", "soporte_samgple", "finanzas_samgple"],
  editarFiscales: ["comercial_samgple", "finanzas_samgple"],
  reenviarInvitacion: ["comercial_samgple", "implantacion_samgple", "soporte_samgple"],
  pedirCambioPropietario: ["soporte_samgple"],
  creditos: ["finanzas_samgple"],
  pausarSuspender: ["soporte_samgple", "finanzas_samgple"],
  reactivar: ["soporte_samgple", "finanzas_samgple"],
  exportar: ["soporte_samgple"],
  borrar: [],
} as const satisfies Record<string, readonly RolPlataforma[]>;
export type AccionCliente = keyof typeof ROLES_ACCION;

export function puedeHacer(roles: readonly RolPlataforma[], accion: AccionCliente): boolean {
  if (roles.includes("admin_samgple")) return true;
  const permitidos: readonly RolPlataforma[] = ROLES_ACCION[accion];
  return permitidos.some((r) => roles.includes(r));
}

export const SERVICIOS = [
  { id: "implantacion", nombre: "Implantación guiada" },
  { id: "formacion", nombre: "Formación del equipo" },
  { id: "soporte_prioritario", nombre: "Soporte prioritario" },
  { id: "agente_a_medida", nombre: "Agente a medida" },
  { id: "integraciones", nombre: "Integraciones" },
] as const;
export type ServicioId = (typeof SERVICIOS)[number]["id"];
export const SERVICIOS_IDS = SERVICIOS.map((s) => s.id) as [ServicioId, ...ServicioId[]];

export const MOTIVOS_SUSPENSION = [
  { id: "impago", nombre: "Impago" },
  { id: "abuso", nombre: "Abuso o uso indebido" },
  { id: "peticion_cliente", nombre: "Petición del cliente" },
] as const;
export type MotivoSuspension = (typeof MOTIVOS_SUSPENSION)[number]["id"];
export const MOTIVOS_IDS = MOTIVOS_SUSPENSION.map((m) => m.id) as [MotivoSuspension, ...MotivoSuspension[]];

/** Créditos que se pueden regalar o ajustar de una vez y caducidad por defecto de un regalo. */
export const LIMITES_CREDITOS = { maximoPorOperacion: 500_000, diasPorDefecto: 365, diasMaximo: 730 } as const;

/** La exportación se puede descargar durante estos días. */
export const DIAS_EXPORTACION = 7;

/**
 * Umbrales del indicador de salud. Cada señal da verde, ámbar o rojo; el color final es el peor.
 * Actividad: días desde la última actividad. Valoraciones y recargas: últimos 30 días.
 */
export const UMBRALES_SALUD = {
  diasSinActividadAmbar: 7,
  diasSinActividadRojo: 30,
  negativasAmbar: 1,
  negativasRojo: 3,
  agentesSuspendidosAmbar: 1,
  agentesSuspendidosRojo: 2,
  recargasFallidasAmbar: 1,
  recargasFallidasRojo: 2,
} as const;

export const NOMBRE_ESTADO_EMPRESA: Record<string, string> = { en_implantacion: "En implantación", activa: "Activa", suspendida: "Suspendida", borrada: "Borrada" };
/** Estados en los que la empresa entra en su oficina y sus agentes pueden trabajar (como empresa_operativa() en la base). */
export const esOperativa = (estado: string) => estado === "activa" || estado === "en_implantacion";
export const NOMBRE_ESTADO_OFICINA: Record<string, string> = {
  activa: "Activa", saldo_bajo: "Saldo bajo", sin_saldo: "Sin saldo", pausada: "Pausada por inactividad", pendiente_borrado: "Pendiente de borrado",
};
