/** Para las pruebas: una sesión a partir de un rol (admite los nombres antiguos owner/admin/member). */
import type { RolEmpresa } from "./permisos.ts";
import type { Sesion } from "./sesion.ts";

const ROL: Record<string, RolEmpresa> = { owner: "propietario", propietario: "propietario", admin: "admin", member: "miembro", miembro: "miembro" };
export function sesionDePrueba(companyId: string, userId: string, rol: string): Sesion {
  const r = ROL[rol];
  if (!r) throw new Error(`Rol desconocido: ${rol}`);
  return { companyId, userId, rol: r, puedeAprobar: r !== "miembro" };
}
