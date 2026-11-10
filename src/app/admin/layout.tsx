import type { Metadata } from "next";
import { Background } from "@/components/Background";

// Panel interno de IDESIE: nunca se indexa.
export const metadata: Metadata = { title: "Panel interno · Oficina Virtual IA", robots: { index: false, follow: false } };

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Background />
      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-8 md:px-8">{children}</main>
    </>
  );
}
