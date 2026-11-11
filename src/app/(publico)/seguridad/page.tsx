import type { Metadata } from "next";
import { SeguridadExperiencia } from "@/components/publico/SeguridadExperiencia";

export const metadata: Metadata = {
  title: "Seguridad",
  description: "Tú tienes el control: aprobaciones, tareas con un motivo, certificación propia de MyOfia, datos aislados y transparencia ante tus clientes.",
};

export default function Seguridad() {
  return <SeguridadExperiencia />;
}
