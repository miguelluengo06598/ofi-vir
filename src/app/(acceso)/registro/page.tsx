import { redirect } from "next/navigation";
import { RegistroForm } from "@/components/acceso/FormularioAcceso";

export default function RegistroPage() {
  if (process.env.REGISTRO_ABIERTO !== "true") redirect("/solicitar-acceso");
  return <RegistroForm />;
}
