import { usuarioActual } from "@/lib/supabase/server";
import { GlassPanel } from "@/components/glass";
import { ExportacionesEmpresa } from "@/components/empresas/AvisosSamgple";

export default async function CuentaPage() {
  const user = await usuarioActual();
  return <><GlassPanel as="section" className="mx-auto w-full max-w-2xl p-6"><h1 className="text-xl font-semibold">Mi cuenta</h1><p className="mt-2 text-small text-ink-2">Gestiona tu acceso a la oficina virtual.</p><dl className="mt-6 grid gap-4 text-small"><div><dt className="text-ink-2">Correo</dt><dd className="mt-1">{user?.email}</dd></div><div><dt className="text-ink-2">Confirmación</dt><dd className="mt-1">{user?.email_confirmed_at ? "Correo confirmado" : "Pendiente de confirmación"}</dd></div></dl></GlassPanel><ExportacionesEmpresa /></>;
}
