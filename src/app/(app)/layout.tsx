import { ApprovalsProvider } from "@/components/ApprovalsProvider";
import { Background } from "@/components/Background";
import { ConsultDialog } from "@/components/experts/ConsultDialog";
import { Dock, TopBar } from "@/components/glass";
import { ChainDialog } from "@/components/handoffs/ChainDialog";
import { SimulationProvider } from "@/components/SimulationProvider";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <ApprovalsProvider>
      <SimulationProvider>
        <a
          href="#contenido"
          className="fixed top-2 left-2 z-[100] -translate-y-20 rounded-pill bg-white px-4 py-2 text-small text-black focus:translate-y-0"
        >
          Saltar al contenido
        </a>
        <Background />

        <TopBar />
        <Dock />

        {/* Márgenes para no quedar bajo la TopBar (2 filas en móvil) ni el Dock. */}
        <main id="contenido" className="flex flex-1 flex-col px-4 pt-36 pb-28 md:pr-6 md:pb-8 md:pl-24 lg:pt-28">
          {children}
        </main>
        <ConsultDialog />
        <ChainDialog />
      </SimulationProvider>
    </ApprovalsProvider>
  );
}
