import { CreditosProvider } from "@/components/creditos/CreditosProvider";
import { ApprovalsProvider } from "@/components/ApprovalsProvider";
import { Background } from "@/components/Background";
import { ContactDialog } from "@/components/emails/ContactDialog";
import { ConsultDialog } from "@/components/experts/ConsultDialog";
import { Dock, TopBar } from "@/components/glass";
import { InboxProvider } from "@/components/InboxProvider";
import { ChainDialog } from "@/components/handoffs/ChainDialog";
import { SimulationProvider } from "@/components/SimulationProvider";
import { redirect } from "next/navigation";
import { GlassPanel } from "@/components/glass";
import { supabaseAdmin, usuarioActual } from "@/lib/supabase/server";
import { empresaPedida, sesionEnEmpresa } from "@/lib/empresas/sesion";
import { headers } from "next/headers";

// La sesión y la empresa activa son datos por petición; esta rama no puede prerenderizarse.
export const instant = false;

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Esta capa es deliberadamente independiente del Proxy: nunca confiamos solo en una redirección.
  const persona = await usuarioActual();
  if (!persona) redirect("/login?next=/oficina");
  const db = supabaseAdmin();
  const cabeceras = await headers();
  const sesion = await sesionEnEmpresa(db, persona.id, empresaPedida(cabeceras));
  if (!sesion) {
    return <><Background /><main className="flex flex-1 items-center justify-center p-6"><GlassPanel strong className="max-w-md p-8 text-center"><h1 className="text-xl font-semibold">Tu cuenta no tiene ninguna oficina</h1><p className="mt-3 text-small text-ink-2">Pide una invitación a la persona responsable de tu empresa para empezar a trabajar.</p><a href="/solicitar-acceso" className="mt-6 inline-flex rounded-pill bg-white px-5 py-3 text-small font-semibold text-black">Solicitar acceso</a></GlassPanel></main></>;
  }
  const { data: perfil } = await db.from("users").select("full_name, email").eq("id", persona.id).maybeSingle();
  return (
    <CreditosProvider>
    <ApprovalsProvider>
      <InboxProvider>
      <SimulationProvider>
        <a
          href="#contenido"
          className="fixed top-2 left-2 z-[100] -translate-y-20 rounded-pill bg-white px-4 py-2 text-small text-black focus:translate-y-0"
        >
          Saltar al contenido
        </a>
        <Background />

        <TopBar usuario={{ nombre: perfil?.full_name || persona.user_metadata.full_name || persona.email || "Mi cuenta", email: perfil?.email || persona.email || "" }} rol={sesion.rol} />
        <Dock />

        {/* Márgenes para no quedar bajo la TopBar (2 filas en móvil) ni el Dock. */}
        <main id="contenido" className="flex flex-1 flex-col px-4 pt-36 pb-28 md:pr-6 md:pb-8 md:pl-24 lg:pt-28">
          {children}
        </main>
        <ConsultDialog />
        <ContactDialog />
        <ChainDialog />
      </SimulationProvider>
      </InboxProvider>
    </ApprovalsProvider>
    </CreditosProvider>
  );
}
