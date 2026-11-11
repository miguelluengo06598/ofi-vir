/** Dependencias de las rutas de empresas a partir del entorno. Solo servidor. */
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import type { DepsEmpresas } from "./api.ts";
import { autenticadorSupabase, identificadorPersona } from "./sesion.ts";

const escaparHtml = (texto: string) => texto.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);

export function depsEmpresasDesdeEntorno(env: Record<string, string | undefined> = process.env): DepsEmpresas | null {
  const url = env.NEXT_PUBLIC_SUPABASE_URL, key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  const db = createClient(url, key, { auth: { persistSession: false } });
  const appUrl = env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/+$/, "") || env.APP_URL?.trim().replace(/\/+$/, "") || null;
  const resendKey = env.RESEND_API_KEY?.trim(), desde = env.RESEND_FROM_EMAIL?.trim();
  const enviarInvitacion = resendKey && desde ? async ({ para, empresa, rol, enlace }: { para: string; empresa: string; rol: "admin" | "miembro"; enlace: string }) => {
    const nombreRol = rol === "admin" ? "administrador" : "miembro";
    const empresaSegura = escaparHtml(empresa);
    const resultado = await new Resend(resendKey).emails.send({ from: desde, to: para, subject: `Te han invitado a ${empresa}`, text: `Te han invitado a ${empresa} como ${nombreRol}. Acepta la invitación: ${enlace}`, html: `<div style="font-family:Arial,sans-serif;background:#101827;color:#fff;padding:32px"><div style="max-width:560px;margin:auto;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.2);border-radius:20px;padding:32px"><p style="color:#b9c4d6">SAMGPLE</p><h1 style="font-size:24px">Te han invitado a ${empresaSegura}</h1><p>Tu rol será <strong>${nombreRol}</strong>. La invitación caduca en 7 días.</p><p style="margin:28px 0"><a href="${enlace}" style="background:#fff;color:#101827;padding:12px 20px;border-radius:999px;text-decoration:none;font-weight:700">Aceptar invitación</a></p><p style="color:#b9c4d6;font-size:13px">Si no esperabas este correo, puedes ignorarlo.</p></div></div>` });
    if (resultado.error) throw new Error(resultado.error.message);
  } : undefined;
  return { db, autenticar: autenticadorSupabase(db, env), persona: identificadorPersona(db, env), appUrl, produccion: env.NODE_ENV === "production", enviarInvitacion };
}
