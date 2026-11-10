"use server";

import { headers } from "next/headers";
import { createHash } from "node:crypto";
import { redirect } from "next/navigation";
import { z } from "zod";
import { permitir } from "@/lib/auth/rate-limit";
import { supabaseAdmin, supabaseServidor } from "@/lib/supabase/server";

export type EstadoAcceso = { error?: string; aviso?: string };
const Credenciales = z.object({
  email: z.email("Escribe un correo válido.").max(254).transform((v) => v.trim().toLowerCase()),
  password: z.string().min(10, "La contraseña debe tener al menos 10 caracteres.").max(200),
});
const Registro = Credenciales.extend({ nombre: z.string().trim().min(2, "Escribe tu nombre.").max(100), empresa: z.string().trim().min(2, "Escribe el nombre de la empresa.").max(120) });

function destinoSeguro(valor: FormDataEntryValue | null, porDefecto = "/oficina") {
  const ruta = typeof valor === "string" ? valor : "";
  return ruta.startsWith("/") && !ruta.startsWith("//") ? ruta : porDefecto;
}
function sitio() { return (process.env.NEXT_PUBLIC_SITE_URL || process.env.APP_URL || "http://localhost:3000").replace(/\/$/, ""); }
async function claveCliente(accion: string) {
  const h = await headers();
  return `${accion}:${h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "desconocido"}`;
}

export async function entrar(_anterior: EstadoAcceso, datos: FormData): Promise<EstadoAcceso> {
  if (!permitir(await claveCliente("login"), 5, 15 * 60_000)) return { error: "Demasiados intentos. Espera unos minutos antes de volver a intentarlo." };
  const v = Credenciales.safeParse({ email: datos.get("email"), password: datos.get("password") });
  if (!v.success) return { error: v.error.issues[0]?.message ?? "Revisa los datos." };
  const supabase = await supabaseServidor();
  const { error } = await supabase.auth.signInWithPassword(v.data);
  // La respuesta es deliberadamente genérica: no confirma si el correo está registrado.
  if (error) return { error: "No hemos podido iniciar sesión con esos datos. Revisa el correo, la contraseña y la confirmación de tu cuenta." };
  redirect(destinoSeguro(datos.get("next")));
}

export async function enviarEnlaceMagico(_anterior: EstadoAcceso, datos: FormData): Promise<EstadoAcceso> {
  if (!permitir(await claveCliente("magic-link"), 3, 10 * 60_000)) return { aviso: "Si la dirección puede recibir mensajes, te enviaremos un enlace dentro de unos minutos." };
  const email = z.email().safeParse(datos.get("email"));
  if (!email.success) return { error: "Escribe un correo válido." };
  const supabase = await supabaseServidor();
  await supabase.auth.signInWithOtp({ email: email.data.trim().toLowerCase(), options: { emailRedirectTo: `${sitio()}/auth/callback?next=${encodeURIComponent(destinoSeguro(datos.get("next")))}`, shouldCreateUser: false } });
  return { aviso: "Si la dirección puede recibir mensajes, te hemos enviado un enlace de acceso." };
}

export async function enviarRecuperacion(_anterior: EstadoAcceso, datos: FormData): Promise<EstadoAcceso> {
  if (!permitir(await claveCliente("recovery"), 3, 10 * 60_000)) return { aviso: "Si la dirección puede recibir mensajes, recibirás instrucciones dentro de unos minutos." };
  const email = z.email().safeParse(datos.get("email"));
  if (!email.success) return { error: "Escribe un correo válido." };
  const supabase = await supabaseServidor();
  await supabase.auth.resetPasswordForEmail(email.data.trim().toLowerCase(), { redirectTo: `${sitio()}/auth/callback?next=/actualizar-contrasena` });
  return { aviso: "Si la dirección puede recibir mensajes, recibirás instrucciones para cambiar la contraseña." };
}

export async function actualizarContrasena(_anterior: EstadoAcceso, datos: FormData): Promise<EstadoAcceso> {
  const password = z.string().min(10, "La contraseña debe tener al menos 10 caracteres.").max(200).safeParse(datos.get("password"));
  if (!password.success) return { error: password.error.issues[0]?.message };
  if (password.data !== datos.get("confirmacion")) return { error: "Las contraseñas no coinciden." };
  const supabase = await supabaseServidor();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return { error: "El enlace ha caducado. Solicita uno nuevo." };
  const { error } = await supabase.auth.updateUser({ password: password.data });
  if (error) return { error: "No hemos podido cambiar la contraseña. Solicita un enlace nuevo e inténtalo otra vez." };
  redirect("/oficina");
}

export async function registrar(_anterior: EstadoAcceso, datos: FormData): Promise<EstadoAcceso> {
  if (process.env.REGISTRO_ABIERTO !== "true") redirect("/solicitar-acceso");
  if (!permitir(await claveCliente("signup"), 3, 60 * 60_000)) return { error: "No podemos crear más cuentas desde esta conexión ahora. Prueba más tarde." };
  const v = Registro.safeParse({ nombre: datos.get("nombre"), empresa: datos.get("empresa"), email: datos.get("email"), password: datos.get("password") });
  if (!v.success) return { error: v.error.issues[0]?.message ?? "Revisa los datos." };
  const supabase = await supabaseServidor();
  const { data, error } = await supabase.auth.signUp({ email: v.data.email, password: v.data.password, options: { data: { full_name: v.data.nombre }, emailRedirectTo: `${sitio()}/auth/callback?next=/oficina` } });
  // Supabase no revela si el correo ya existe; tampoco lo hacemos nosotros.
  if (error) return { error: "No hemos podido crear la cuenta. Prueba de nuevo más tarde." };
  if (data.user?.identities?.length) {
    const db = supabaseAdmin();
    const { data: empresa, error: errorEmpresa } = await db.from("companies").insert({ name: v.data.empresa, estado: "activa" }).select("id").single();
    if (errorEmpresa || !empresa) return { error: "La cuenta se ha creado, pero no hemos podido preparar la oficina. Contacta con soporte." };
    await db.from("users").upsert({ id: data.user.id, full_name: v.data.nombre, email: v.data.email }, { onConflict: "id" });
    const { error: errorMiembro } = await db.from("company_members").insert({ company_id: empresa.id, user_id: data.user.id, rol: "propietario", estado: "activo", puede_aprobar: true });
    if (errorMiembro) return { error: "La cuenta se ha creado, pero no hemos podido preparar la oficina. Contacta con soporte." };
  }
  return { aviso: "Revisa tu correo para confirmar la cuenta. Si ya existía, te enviaremos las instrucciones correspondientes." };
}

export async function registrarInvitado(token: string, _anterior: EstadoAcceso, datos: FormData): Promise<EstadoAcceso> {
  if (!permitir(await claveCliente("invite-signup"), 3, 60 * 60_000)) return { error: "No podemos crear más cuentas desde esta conexión ahora. Prueba más tarde." };
  const v = Credenciales.extend({ nombre: z.string().trim().min(2, "Escribe tu nombre.").max(100) }).safeParse({ nombre: datos.get("nombre"), email: datos.get("email"), password: datos.get("password") });
  if (!v.success) return { error: v.error.issues[0]?.message ?? "Revisa los datos." };
  const db = supabaseAdmin();
  const { data: invitacion } = await db.from("company_invitations").select("email").eq("token_hash", createHash("sha256").update(token).digest("hex")).is("aceptada_en", null).is("revocada_en", null).gt("caduca_en", new Date().toISOString()).maybeSingle();
  if (!invitacion || invitacion.email.toLowerCase() !== v.data.email) return { error: "La invitación no es válida para este correo, ha caducado o ya se ha usado." };
  const supabase = await supabaseServidor();
  const { error } = await supabase.auth.signUp({ email: v.data.email, password: v.data.password, options: { data: { full_name: v.data.nombre }, emailRedirectTo: `${sitio()}/auth/callback?next=${encodeURIComponent(`/invitacion/${token}`)}` } });
  if (error) return { error: "No hemos podido crear la cuenta. Prueba de nuevo más tarde." };
  return { aviso: "Revisa tu correo para confirmar la cuenta. Después podrás aceptar la invitación." };
}

export async function aceptarInvitacion(token: string): Promise<EstadoAcceso> {
  const supabase = await supabaseServidor();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return { error: "Inicia sesión con el correo que recibió la invitación." };
  const db = supabaseAdmin();
  const { error } = await db.rpc("invitacion_aceptar", { p_token_hash: createHash("sha256").update(token).digest("hex"), p_user_id: data.user.id });
  if (error) return { error: "La invitación no es válida para esta cuenta, ha caducado o ya se ha usado." };
  redirect("/oficina");
}

export async function cerrarSesion() {
  const supabase = await supabaseServidor();
  await supabase.auth.signOut({ scope: "global" });
  redirect("/login");
}
