import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import "./globals.css";
import { MotionProvider } from "@/components/MotionProvider";

const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["400", "600"],
});

export const metadata: Metadata = {
  title: "Oficina Virtual IA",
  description: "Tu oficina virtual con agentes de IA organizados por departamentos.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className={`${poppins.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col"><MotionProvider>{children}</MotionProvider></body>
    </html>
  );
}
