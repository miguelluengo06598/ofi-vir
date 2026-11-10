"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Building2, UserPlus } from "lucide-react";
import { aceptarInvitacion, registrarInvitado, type EstadoAcceso } from "@/app/(acceso)/acciones";
import { GlassPanel } from "@/components/glass";

const vacio: EstadoAcceso = {};
const Aviso = ({ estado }: { estado: EstadoAcceso }) => estado.error ? <p role="alert" className="rounded-card bg-red-500/15 px-3 py-2 text-small text-red-100">{estado.error}</p> : estado.aviso ? <p role="status" className="rounded-card bg-status-working/15 px-3 py-2 text-small">{estado.aviso}</p> : null;
const Campo = ({ name, label, type = "text" }: { name: string; label: string; type?: string }) => <label className="grid gap-1.5 text-small text-ink-2"><span>{label}</span><input required name={name} type={type} minLength={type === "password" ? 10 : undefined} className="glass rounded-card px-3 py-3 text-white outline-none" /></label>;

export function Invitacion({ token, empresa, rol, haIniciadoSesion }: { token: string; empresa: string; rol: string; haIniciadoSesion: boolean }) {
  const [estadoAceptar, aceptar, aceptando] = useActionState(aceptarInvitacion.bind(null, token), vacio);
  const [estadoRegistro, registro, registrando] = useActionState(registrarInvitado.bind(null, token), vacio);
  return <GlassPanel as="section" strong className="w-full max-w-md p-6 shadow-2xl sm:p-8"><span className="flex size-10 items-center justify-center rounded-full bg-white/15"><UserPlus size={20} /></span><h1 className="mt-4 text-xl font-semibold">Te han invitado a una oficina</h1><div className="mt-4 flex items-center gap-3 rounded-card bg-black/15 p-3"><Building2 size={18} className="text-ink-2" /><div><p className="font-medium">{empresa}</p><p className="text-small text-ink-2">Rol: {rol}</p></div></div>{haIniciadoSesion ? <form action={aceptar} className="mt-6 grid gap-4"><Aviso estado={estadoAceptar} /><button disabled={aceptando} className="rounded-pill bg-white px-4 py-3 text-small font-semibold text-black disabled:opacity-60">{aceptando ? "Aceptando…" : "Aceptar invitación"}</button><p className="text-center text-small text-ink-2">Asegúrate de haber entrado con el correo invitado.</p></form> : <><p className="mt-6 text-small text-ink-2">Crea una cuenta con el correo al que se envió esta invitación, o entra si ya tienes una.</p><form action={registro} className="mt-5 grid gap-4"><Aviso estado={estadoRegistro} /><Campo name="nombre" label="Tu nombre" /><Campo name="email" label="Correo invitado" type="email" /><Campo name="password" label="Contraseña (mínimo 10 caracteres)" type="password" /><button disabled={registrando} className="rounded-pill bg-white px-4 py-3 text-small font-semibold text-black disabled:opacity-60">{registrando ? "Creando…" : "Crear cuenta"}</button></form><Link href={`/login?next=${encodeURIComponent(`/invitacion/${token}`)}`} className="mt-4 block text-center text-small text-white underline-offset-4 hover:underline">Ya tengo cuenta: entrar</Link></>}</GlassPanel>;
}
