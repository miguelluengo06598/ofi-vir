import type { Metadata } from "next";
import { ViewTransition } from "react";
import "./transiciones.css";
import { BannerConsentimiento } from "@/components/publico/Consentimiento";
import { CabeceraPublica } from "@/components/publico/CabeceraPublica";
import { EscenaPublica } from "@/components/publico/EscenaPublica";
import { PiePublico } from "@/components/publico/PiePublico";

const sitio = process.env.NEXT_PUBLIC_SITE_URL?.trim();
const indexable = process.env.VERCEL_ENV === "production" && Boolean(sitio);

export const metadata: Metadata = {
  metadataBase: new URL(sitio || "http://localhost:3000"),
  title: { default: "MyOfia · Tu equipo de IA por departamentos", template: "%s · MyOfia" },
  description:
    "Agentes de ventas, atención al cliente, marketing y CRM que se pasan el trabajo entre ellos, conectados a tus herramientas. Tú solo apruebas lo importante.",
  robots: { index: indexable, follow: indexable },
  openGraph: {
    type: "website",
    locale: "es_ES",
    siteName: "MyOfia",
  },
  twitter: { card: "summary_large_image" },
};

/** Web pública: estática, sin sesión y sin el código de la oficina (salvo la demo, que se carga aparte). */
export default function PublicoLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <a
        href="#contenido"
        className="fixed top-2 left-2 z-[100] -translate-y-20 rounded-pill bg-white px-4 py-2 text-small text-black focus:translate-y-0"
      >
        Saltar al contenido
      </a>
      <EscenaPublica />
      <CabeceraPublica />
      {/* Solo el contenido entra en la transición entre páginas; la escena y la cabecera no se mueven. */}
      <main id="contenido" className="flex flex-1 flex-col pt-20">
        <ViewTransition default="pagina">
          <div className="flex flex-1 flex-col">{children}</div>
        </ViewTransition>
      </main>
      <PiePublico />
      {/* Desactivado mientras no haya cookies opcionales (src/config/cookies.ts). */}
      <BannerConsentimiento />
    </>
  );
}
