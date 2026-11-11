import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { Background } from "@/components/Background";
import { sesionPlataforma } from "@/lib/admin/acceso";
import { dbAdminDesdeEntorno } from "@/lib/admin/entorno";
import { usuarioActual } from "@/lib/supabase/server";

// Panel interno de IDESIE: nunca se indexa.
export const metadata: Metadata = { title: "Panel interno · MyOfia", robots: { index: false, follow: false } };
export const instant = false;

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const persona = await usuarioActual();
  if (!persona) redirect("/login?next=/admin");
  const db = dbAdminDesdeEntorno();
  const cabeceras = await headers();
  // La MFA se hace cumplir en el proxy y las páginas/acciones vuelven a exigir su rol concreto.
  // Aquí no exigimos AAL2 para que /admin/mfa pueda mostrar el configurador a una persona de plataforma.
  if (!db || !(await sesionPlataforma(cabeceras, db))) notFound();
  return (
    <>
      <Background />
      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-8 md:px-8">{children}</main>
    </>
  );
}
