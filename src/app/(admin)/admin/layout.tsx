import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { Background } from "@/components/Background";
import { CabeceraSamgple } from "@/components/admin/oficina/CabeceraSamgple";
import { NavSamgple, type EnlaceAdmin } from "@/components/admin/oficina/NavSamgple";
import { sesionPlataforma, tieneRol, type RolPlataforma } from "@/lib/admin/acceso";
import { ROLES_CLIENTES } from "@/lib/admin/clientes/config";
import { ROLES_COMERCIAL } from "@/lib/admin/comercial/config";
import { dbAdminDesdeEntorno } from "@/lib/admin/entorno";
import { ROLES_IMPLANTACION } from "@/lib/admin/implantacion/config";
import { tokenDeAcceso } from "@/lib/supabase/request";

// Panel interno de MyOfia: nunca se indexa.
export const metadata: Metadata = { title: "Panel interno · MyOfia", robots: { index: false, follow: false } };
export const instant = false;

/** Secciones del panel y quién las ve (administración ve todas). Las páginas y acciones vuelven a exigir su rol. */
const SECCIONES: (EnlaceAdmin & { roles: readonly RolPlataforma[] })[] = [
  { href: "/admin", label: "Inicio", roles: ["comercial_samgple", "implantacion_samgple", "revisor_samgple", "soporte_samgple", "finanzas_samgple"] },
  { href: "/admin/comercial", label: "Comercial", roles: ROLES_COMERCIAL },
  { href: "/admin/clientes", label: "Clientes", roles: ROLES_CLIENTES },
  { href: "/admin/implantacion", label: "Implantación", roles: ROLES_IMPLANTACION },
  { href: "/admin/certificacion", label: "Certificación", roles: ["revisor_samgple"] },
  { href: "/admin/margenes", label: "Márgenes", roles: ["finanzas_samgple"] },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const cabeceras = await headers();
  if (!tokenDeAcceso(cabeceras)) redirect("/login?next=/admin");
  const db = dbAdminDesdeEntorno();
  // La MFA se hace cumplir en el proxy y cada página/acción vuelve a exigir su rol concreto. Aquí no se exige
  // AAL2 para que /admin/mfa pueda mostrarse; sin MFA verificada no se enseña la navegación.
  const sesion = db ? await sesionPlataforma(cabeceras, db) : null;
  if (!sesion) notFound();
  return (
    <>
      <Background />
      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-8 md:px-8">
        {sesion.mfaVerificada && (
          <>
            <CabeceraSamgple nombre={sesion.nombre} roles={sesion.roles} miOficina={sesion.roles.includes("admin_samgple")} />
            <NavSamgple enlaces={SECCIONES.filter((s) => tieneRol(sesion, s.roles)).map(({ href, label }) => ({ href, label }))} />
          </>
        )}
        {children}
      </main>
    </>
  );
}
