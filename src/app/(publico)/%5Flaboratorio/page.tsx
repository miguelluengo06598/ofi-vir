import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Laboratorio } from "./Laboratorio";

// Página interna: no se indexa y en producción no existe.
export const metadata: Metadata = { title: "Laboratorio de la presentación", robots: { index: false, follow: false } };

const esPrueba = process.env.NODE_ENV !== "production" || ["preview", "development"].includes(process.env.VERCEL_ENV ?? "");

export default function LaboratorioPage() {
  if (!esPrueba) notFound();
  return <Laboratorio />;
}
