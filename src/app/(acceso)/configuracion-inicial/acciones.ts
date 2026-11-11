"use server";

import { isIP } from "node:net";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { crearPrimerAdmin } from "@/lib/admin/configuracionInicial";
import { permitir } from "@/lib/auth/rate-limit";
import { supabaseAdmin, supabaseServidor } from "@/lib/supabase/server";

export type EstadoConfiguracion = { error?: string };

const Datos = z.object({
  clave: z.string().trim().min(1, "Escribe la clave de instalación.").max(500),
  nombre: z.string().trim().min(2, "Escribe tu nombre.").max(100),
  email: z.email("Escribe un correo válido.").max(254).transform((v) => v.trim().toLowerCase()),
  password: z.string().min(12, "La contraseña debe tener al menos 12 caracteres.").max(200),
  confirmacion: z.string(),
});

const MENSAJES = {
  cerrada: "La configuración inicial ya se hizo: esta página está cerrada. Entra con tu cuenta.",
  sin_clave: "Falta la variable CONFIGURACION_INICIAL_CLAVE en el servidor (mínimo 24 caracteres).",
  clave_incorrecta: "La clave de instalación no es correcta.",
  correo_en_uso: "Ya existe una cuenta con ese correo. Usa otro.",
  error: "No hemos podido crear la cuenta. Inténtalo de nuevo en unos minutos.",
} as const;

export async function configurarPrimerAdmin(_anterior: EstadoConfiguracion, datos: FormData): Promise<EstadoConfiguracion> {
  const h = await headers();
  const ipBruta = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "";
  const ip = isIP(ipBruta) ? ipBruta : null;
  // Pocos intentos: la clave no se puede adivinar probando.
  if (!permitir(`configuracion-inicial:${ip ?? "desconocido"}`, 5, 15 * 60_000)) {
    return { error: "Demasiados intentos. Espera unos minutos antes de volver a intentarlo." };
  }

  const v = Datos.safeParse(Object.fromEntries(["clave", "nombre", "email", "password", "confirmacion"].map((k) => [k, datos.get(k) ?? ""])));
  if (!v.success) return { error: v.error.issues[0]?.message ?? "Revisa los datos." };
  if (v.data.password !== v.data.confirmacion) return { error: "Las contraseñas no coinciden." };

  const resultado = await crearPrimerAdmin(supabaseAdmin(), { ...v.data, ip });
  if (!resultado.ok) {
    if (resultado.motivo === "cerrada") redirect("/login?next=/admin");
    return { error: MENSAJES[resultado.motivo] };
  }

  // Entra ya con la cuenta nueva y va a configurar la verificación en dos pasos (obligatoria en /admin).
  const supabase = await supabaseServidor();
  const { error } = await supabase.auth.signInWithPassword({ email: v.data.email, password: v.data.password });
  redirect(error ? "/login?next=/admin" : "/admin/mfa");
}
