"use client";

import Link from "next/link";
import { useActionState } from "react";
import { ArrowRight, KeyRound, Mail, ShieldCheck } from "lucide-react";
import type { EstadoAcceso } from "@/app/(acceso)/acciones";
import { actualizarContrasena, entrar, enviarEnlaceMagico, enviarRecuperacion, registrar } from "@/app/(acceso)/acciones";
import { GlassPanel } from "@/components/glass";

const inicio: EstadoAcceso = {};

function Mensaje({ estado }: { estado: EstadoAcceso }) {
  if (estado.error) return <p role="alert" className="rounded-card bg-red-500/15 px-3 py-2 text-small text-red-100">{estado.error}</p>;
  if (estado.aviso) return <p role="status" className="rounded-card bg-status-working/15 px-3 py-2 text-small text-white">{estado.aviso}</p>;
  return null;
}
function Boton({ children, pending }: { children: React.ReactNode; pending: boolean }) {
  return <button type="submit" disabled={pending} className="glass-interactive flex w-full items-center justify-center gap-2 rounded-pill bg-white px-4 py-3 text-small font-semibold text-black disabled:cursor-wait disabled:opacity-60">{children}<ArrowRight size={16} /></button>;
}
function Campo({ name, label, type = "text", autoComplete, minLength }: { name: string; label: string; type?: string; autoComplete?: string; minLength?: number }) {
  return <label className="grid gap-1.5 text-small text-ink-2"><span>{label}</span><input required name={name} type={type} autoComplete={autoComplete} minLength={minLength} className="glass rounded-card px-3 py-3 text-white outline-none ring-white/0 transition focus:ring-2 focus:ring-white/50" /></label>;
}
export function LoginForm({ next }: { next: string }) {
  const [estado, formAction, pendiente] = useActionState(entrar, inicio);
  const [magico, accionMagica, enviando] = useActionState(enviarEnlaceMagico, inicio);
  return <GlassPanel as="section" strong className="w-full max-w-md p-6 shadow-2xl sm:p-8">
    <div className="mb-6 grid gap-2"><span className="flex size-10 items-center justify-center rounded-full bg-white/15"><ShieldCheck size={20} /></span><h1 className="text-xl font-semibold">Bienvenido de nuevo</h1><p className="text-small text-ink-2">Entra a tu oficina virtual.</p></div>
    <form action={formAction} className="grid gap-4"><Mensaje estado={estado} /><input type="hidden" name="next" value={next} /><Campo name="email" label="Correo electrónico" type="email" autoComplete="email" /><Campo name="password" label="Contraseña" type="password" autoComplete="current-password" minLength={10} /><Link href="/recuperar-contrasena" className="text-small text-ink-2 underline-offset-4 hover:text-white hover:underline">¿Has olvidado tu contraseña?</Link><Boton pending={pendiente}>Entrar</Boton></form>
    <div className="my-6 border-t border-white/15" />
    <form action={accionMagica} className="grid gap-3"><Mensaje estado={magico} /><input type="hidden" name="next" value={next} /><input required name="email" type="email" autoComplete="email" placeholder="tu@empresa.com" className="glass rounded-card px-3 py-3 text-small text-white outline-none" /><button type="submit" disabled={enviando} className="flex items-center justify-center gap-2 rounded-pill border border-white/25 px-4 py-2.5 text-small hover:bg-white/10 disabled:opacity-60"><Mail size={16} />{enviando ? "Enviando…" : "Entrar con un enlace por correo"}</button></form>
    <p className="mt-6 text-center text-small text-ink-2">¿No tienes acceso? <Link href="/solicitar-acceso" className="text-white underline-offset-4 hover:underline">Solicitar acceso</Link></p>
    <button type="button" disabled aria-disabled="true" title="Próximamente" className="mt-3 w-full rounded-pill border border-white/10 px-4 py-2 text-small text-ink-3">Continuar con Google · Próximamente</button>
  </GlassPanel>;
}

export function RegistroForm() {
  const [estado, formAction, pendiente] = useActionState(registrar, inicio);
  return <GlassPanel as="section" strong className="w-full max-w-md p-6 shadow-2xl sm:p-8"><div className="mb-6 grid gap-2"><span className="flex size-10 items-center justify-center rounded-full bg-white/15"><KeyRound size={20} /></span><h1 className="text-xl font-semibold">Crea tu oficina</h1><p className="text-small text-ink-2">La confirmación del correo es obligatoria.</p></div><form action={formAction} className="grid gap-4"><Mensaje estado={estado} /><Campo name="nombre" label="Tu nombre" autoComplete="name" /><Campo name="empresa" label="Nombre de la empresa" autoComplete="organization" /><Campo name="email" label="Correo electrónico" type="email" autoComplete="email" /><Campo name="password" label="Contraseña (mínimo 10 caracteres)" type="password" autoComplete="new-password" minLength={10} /><Boton pending={pendiente}>Crear cuenta</Boton></form><p className="mt-6 text-center text-small text-ink-2">¿Ya tienes cuenta? <Link href="/login" className="text-white underline-offset-4 hover:underline">Entrar</Link></p></GlassPanel>;
}

export function RecuperacionForm({ actualizar = false }: { actualizar?: boolean }) {
  const [estado, formAction, pendiente] = useActionState(actualizar ? actualizarContrasena : enviarRecuperacion, inicio);
  return <GlassPanel as="section" strong className="w-full max-w-md p-6 shadow-2xl sm:p-8"><h1 className="text-xl font-semibold">{actualizar ? "Elige una contraseña nueva" : "Recupera tu acceso"}</h1><p className="mt-2 text-small text-ink-2">{actualizar ? "Usa al menos 10 caracteres." : "Te enviaremos un enlace si la dirección puede recibir mensajes."}</p><form action={formAction} className="mt-6 grid gap-4"><Mensaje estado={estado} />{actualizar ? <><Campo name="password" label="Nueva contraseña" type="password" autoComplete="new-password" minLength={10} /><Campo name="confirmacion" label="Repite la contraseña" type="password" autoComplete="new-password" minLength={10} /></> : <Campo name="email" label="Correo electrónico" type="email" autoComplete="email" />}<Boton pending={pendiente}>{actualizar ? "Guardar contraseña" : "Enviar enlace"}</Boton></form></GlassPanel>;
}
