"use client";

import { Mail } from "lucide-react";
import { useState } from "react";
import { GlassPanel } from "@/components/glass";
import { SECTORES, sectorPorSlug, type SlugSector } from "@/content/sectores";

export function SolicitudAcceso({ sectorInicial }: { sectorInicial?: SlugSector }) {
  const [sector, setSector] = useState<SlugSector | "">(sectorInicial ?? "");
  const elegido = sector ? sectorPorSlug(sector) : undefined;
  const asunto = elegido ? "Solicitud de acceso · " + elegido.nombre : "Solicitud de acceso";
  const cuerpo = elegido
    ? "Hola,%0A%0AQuiero solicitar acceso para una oficina virtual orientada a " + encodeURIComponent(elegido.nombre.toLowerCase()) + ".%0A%0AGracias."
    : "Hola,%0A%0AQuiero solicitar acceso a una oficina virtual.%0A%0AGracias.";
  const href = "mailto:acceso@samgple.com?subject=" + encodeURIComponent(asunto) + "&body=" + cuerpo;

  return (
    <GlassPanel as="section" strong className="w-full max-w-md p-8 text-center shadow-2xl">
      <span className="mx-auto flex size-10 items-center justify-center rounded-full bg-white/15"><Mail size={20} /></span>
      <h1 className="mt-4 text-xl font-semibold">Solicita acceso</h1>
      <p className="mt-3 text-small text-ink-2">Cuéntanos desde qué sector partes y prepararemos la conversación con ese contexto. No es un compromiso ni guarda datos en esta página.</p>
      <form className="mt-6 grid gap-4 text-left">
        <label className="grid gap-1.5 text-small text-ink-2">
          <span>Tu sector</span>
          <select value={sector} onChange={(event) => setSector(event.target.value as SlugSector | "")} className="glass rounded-card px-3 py-3 text-white outline-none focus:ring-2 focus:ring-white/50">
            <option value="" className="bg-zinc-900">Aún no lo sé</option>
            {SECTORES.map((item) => <option key={item.slug} value={item.slug} className="bg-zinc-900">{item.nombre}</option>)}
          </select>
        </label>
        {elegido && <p className="rounded-card bg-white/8 p-3 text-small text-ink-2">Prepararemos la conversación con el ejemplo de <span className="font-semibold text-white">{elegido.nombre.toLowerCase()}</span>.</p>}
        <a href={href} className="inline-flex items-center justify-center gap-2 rounded-pill bg-white px-5 py-3 text-small font-semibold text-black hover:bg-white/90">Escribir para solicitar acceso <Mail size={16} aria-hidden="true" /></a>
      </form>
    </GlassPanel>
  );
}
