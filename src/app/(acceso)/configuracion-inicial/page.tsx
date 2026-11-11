import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { ConfiguracionInicialForm } from "@/components/acceso/ConfiguracionInicialForm";
import { claveDeInstalacion, configuracionAbierta } from "@/lib/admin/configuracionInicial";
import { supabaseAdmin } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Configuración inicial", robots: { index: false, follow: false } };

/** Solo existe mientras la plataforma no tiene administrador general; después responde 404 para siempre. */
export default async function ConfiguracionInicialPage() {
  await connection();
  if (!(await configuracionAbierta(supabaseAdmin()))) notFound();
  return <ConfiguracionInicialForm claveConfigurada={claveDeInstalacion() !== null} />;
}
