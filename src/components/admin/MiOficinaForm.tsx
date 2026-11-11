"use client";

import { ArrowRight } from "lucide-react";
import { useActionState } from "react";
import { crearMiOficina, type EstadoMiOficina } from "@/app/(admin)/admin/mi-oficina/acciones";

const inicio: EstadoMiOficina = {};

/** Alta de la oficina propia de MyOfia: solo pide el nombre; nace con los cinco departamentos. */
export function MiOficinaForm() {
  const [estado, accion, pendiente] = useActionState(crearMiOficina, inicio);
  return (
    <form action={accion} className="grid max-w-md gap-4">
      {estado.error && <p role="alert" className="rounded-card bg-red-500/15 px-3 py-2 text-small text-red-100">{estado.error}</p>}
      <label className="grid gap-1.5 text-small text-ink-2">
        <span>Nombre de la oficina</span>
        <input
          required name="nombre" defaultValue="MyOfia" minLength={2} maxLength={160} autoComplete="organization"
          className="glass rounded-card px-3 py-3 text-white outline-none ring-white/0 transition focus:ring-2 focus:ring-white/50"
        />
      </label>
      <button type="submit" disabled={pendiente} className="flex w-fit items-center gap-2 rounded-pill bg-white px-5 py-3 text-small font-semibold text-black disabled:cursor-wait disabled:opacity-60">
        {pendiente ? "Creando la oficina…" : "Crear mi oficina"} <ArrowRight size={16} aria-hidden="true" />
      </button>
    </form>
  );
}
