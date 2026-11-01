import Image from "next/image";
import { ApprovalsProvider } from "@/components/ApprovalsProvider";
import { Dock, TopBar } from "@/components/glass";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <ApprovalsProvider>
      <div aria-hidden="true" className="fixed inset-0 -z-20">
        <Image src="/scenes/oficina.png" alt="" fill priority sizes="100vw" className="object-cover" />
      </div>
      <div aria-hidden="true" className="fixed inset-0 -z-10 bg-linear-to-b from-black/25 to-black/45" />

      <TopBar />
      <Dock />

      {/* Márgenes para no quedar bajo la TopBar (2 filas en móvil) ni el Dock. */}
      <main className="flex flex-1 flex-col px-4 pt-36 pb-28 md:pr-6 md:pb-8 md:pl-24 lg:pt-28">{children}</main>
    </ApprovalsProvider>
  );
}
