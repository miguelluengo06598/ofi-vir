"use client";

import { FormEvent, useEffect, useState } from "react";
import { Mail, UserMinus, UserPlus } from "lucide-react";
import { GlassPanel } from "@/components/glass";

type Rol = "propietario" | "admin" | "miembro";
type Miembro = { userId: string; nombre: string; rol: Rol; estado: "activo" | "invitado" | "desactivado"; puedeAprobar: boolean; desde: string };
type Datos = { yo: { userId: string; rol: Rol; gestiona: boolean }; miembros: Miembro[] };
const etiqueta: Record<Rol, string> = { propietario: "Propietario", admin: "Administrador", miembro: "Miembro" };

export function MiembrosView() {
  const [datos, setDatos] = useState<Datos | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const cargar = () => void fetch("/api/empresas/miembros", { cache: "no-store" }).then(async (r) => r.ok ? setDatos(await r.json()) : setError("No se pudo cargar el equipo.")).catch(() => setError("No se pudo cargar el equipo."));
  useEffect(cargar, []);
  async function invitar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setEnviando(true); setError(null);
    const f = new FormData(e.currentTarget);
    const r = await fetch("/api/empresas/invitaciones", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: f.get("email"), rol: f.get("rol") }) });
    setEnviando(false);
    if (!r.ok) { const b = await r.json().catch(() => null); setError(b?.mensaje ?? "No se pudo enviar la invitación."); return; }
    e.currentTarget.reset(); cargar();
  }
  async function cambiar(miembro: Miembro, cambio: Record<string, unknown>) {
    setError(null);
    const r = await fetch(`/api/empresas/miembros/${miembro.userId}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(cambio) });
    if (!r.ok) { const b = await r.json().catch(() => null); setError(b?.mensaje ?? "No se pudo guardar el cambio."); return; }
    cargar();
  }
  if (!datos) return <GlassPanel className="p-6 text-small text-ink-2">Cargando miembros…</GlassPanel>;
  if (!datos.yo.gestiona) return <GlassPanel className="p-6">No tienes permiso para gestionar miembros.</GlassPanel>;
  return <div className="mx-auto grid w-full max-w-4xl gap-5"><GlassPanel strong className="p-6"><div className="flex items-start gap-3"><span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white/15"><UserPlus size={19} /></span><div><h1 className="text-xl font-semibold">Miembros</h1><p className="mt-1 text-small text-ink-2">Invita, asigna roles y desactiva el acceso a esta oficina.</p></div></div><form onSubmit={invitar} className="mt-6 grid gap-3 sm:grid-cols-[1fr_180px_auto]"><label className="sr-only" htmlFor="email-invitacion">Correo</label><input id="email-invitacion" required name="email" type="email" placeholder="persona@empresa.com" className="glass rounded-pill px-4 py-3 text-small outline-none" /><select name="rol" defaultValue="miembro" className="glass rounded-pill px-4 py-3 text-small outline-none"><option className="text-black" value="miembro">Miembro</option><option className="text-black" value="admin">Administrador</option></select><button disabled={enviando} className="inline-flex items-center justify-center gap-2 rounded-pill bg-white px-4 py-3 text-small font-semibold text-black disabled:opacity-60"><Mail size={16} />{enviando ? "Enviando…" : "Invitar"}</button></form>{error && <p role="alert" className="mt-4 rounded-card bg-red-500/15 px-3 py-2 text-small text-red-100">{error}</p>}</GlassPanel><GlassPanel className="overflow-hidden"><ul className="divide-y divide-white/10">{datos.miembros.map((m) => <li key={m.userId} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-medium">{m.nombre}</p><p className="text-small text-ink-2">{etiqueta[m.rol]} · {m.estado === "activo" ? "Activo" : m.estado === "desactivado" ? "Desactivado" : "Invitado"}</p></div>{m.rol === "propietario" ? <span className="text-small text-ink-2">Propietario</span> : <div className="flex flex-wrap items-center gap-2"><select aria-label={`Rol de ${m.nombre}`} value={m.rol} onChange={(e) => void cambiar(m, { rol: e.target.value })} className="glass rounded-pill px-3 py-2 text-small outline-none"><option className="text-black" value="admin">Administrador</option><option className="text-black" value="miembro">Miembro</option></select><button type="button" onClick={() => void cambiar(m, { estado: m.estado === "desactivado" ? "activo" : "desactivado" })} className="inline-flex items-center gap-1 rounded-pill border border-white/20 px-3 py-2 text-small hover:bg-white/10"><UserMinus size={15} />{m.estado === "desactivado" ? "Reactivar" : "Desactivar"}</button></div>}</li>)}</ul></GlassPanel></div>;
}
