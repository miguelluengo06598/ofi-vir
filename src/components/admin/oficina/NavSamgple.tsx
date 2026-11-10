import Link from "next/link";
import type { RolPlataforma } from "@/lib/admin/acceso";
import { ROLES_CLIENTES } from "@/lib/admin/clientes/config";
import { ROLES_COMERCIAL } from "@/lib/admin/comercial/config";

const ENLACES: { href: string; label: string; roles: readonly RolPlataforma[] }[] = [
  { href: "/admin", label: "Inicio", roles: ["admin_samgple", "comercial_samgple", "implantacion_samgple", "revisor_samgple", "soporte_samgple", "finanzas_samgple"] },
  { href: "/admin/comercial", label: "Comercial", roles: ROLES_COMERCIAL },
  { href: "/admin/clientes", label: "Clientes", roles: ROLES_CLIENTES },
  { href: "/admin/certificacion", label: "Certificación", roles: ["admin_samgple", "revisor_samgple"] },
  { href: "/admin/margenes", label: "Márgenes", roles: ["admin_samgple", "finanzas_samgple"] },
];

/** Accesos de la oficina de SAMGPLE: solo los que el rol de la persona puede abrir. */
export function NavSamgple({ roles, actual }: { roles: readonly RolPlataforma[]; actual: string }) {
  const puede = (r: readonly RolPlataforma[]) => roles.includes("admin_samgple") || r.some((x) => roles.includes(x));
  return (
    <nav aria-label="Oficina de SAMGPLE">
      <ul className="flex flex-wrap gap-1.5">
        {ENLACES.filter((e) => puede(e.roles)).map((e) => (
          <li key={e.href}>
            <Link href={e.href} aria-current={actual === e.href ? "page" : undefined} className="glass glass-interactive inline-flex rounded-pill px-4 py-2 text-small aria-[current=page]:bg-white! aria-[current=page]:text-black">
              {e.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
