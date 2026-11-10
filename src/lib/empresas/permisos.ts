/**
 * Roles de empresa y qué puede hacer cada uno. ÚNICA fuente de esta regla en el código (la base la repite con tiene_rol()).
 *  - propietario: todo, incluido comprar créditos, borrar la empresa y gestionar miembros.
 *  - admin: todo menos borrar la empresa y cambiar al propietario.
 *  - miembro: usar la oficina, chatear con agentes, aprobar o rechazar si tiene permiso; no gestiona miembros, créditos ni conexiones.
 * Sin dependencias de servidor: lo puede importar también la interfaz para mostrar u ocultar botones (la decisión real es del servidor).
 */
export const ROLES_EMPRESA = ["propietario", "admin", "miembro"] as const;
export type RolEmpresa = (typeof ROLES_EMPRESA)[number];

export type Accion =
  | "usar_oficina" | "aprobar" | "gestionar_miembros" | "gestionar_creditos" | "gestionar_conexiones" | "gestionar_agentes"
  | "gestionar_certificacion" | "transferir_propiedad" | "borrar_empresa";

const GESTION: Accion[] = ["gestionar_miembros", "gestionar_creditos", "gestionar_conexiones", "gestionar_agentes", "gestionar_certificacion"];
const PERMISOS: Readonly<Record<RolEmpresa, readonly Accion[]>> = Object.freeze({
  propietario: ["usar_oficina", "aprobar", ...GESTION, "transferir_propiedad", "borrar_empresa"],
  admin: ["usar_oficina", "aprobar", ...GESTION],
  miembro: ["usar_oficina"],
});

/** ¿Puede este rol hacer esto? `aprobar` para un miembro depende de su permiso individual (`puedeAprobar`). */
export function puede(rol: RolEmpresa, accion: Accion, o: { puedeAprobar?: boolean } = {}): boolean {
  if (accion === "aprobar" && rol === "miembro") return o.puedeAprobar === true;
  return PERMISOS[rol]?.includes(accion) ?? false;
}

/** Propietario o admin: quienes gestionan la empresa (créditos, conexiones, agentes, miembros, certificación). */
export const esGestor = (rol: RolEmpresa): boolean => rol === "propietario" || rol === "admin";

export const NOMBRE_ROL: Record<RolEmpresa, string> = { propietario: "Propietario", admin: "Administrador", miembro: "Miembro" };
