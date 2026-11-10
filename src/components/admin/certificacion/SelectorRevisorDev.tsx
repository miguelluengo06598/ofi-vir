"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { cambiarRevisorDeDesarrollo } from "@/app/admin/certificacion/acciones";

/** SOLO DESARROLLO: mientras no hay inicio de sesión, permite ver el panel como otra persona del equipo (para la segunda opinión). */
export function SelectorRevisorDev({ actual, revisores }: { actual: string; revisores: { userId: string; nombre: string; rol: string }[] }) {
  const router = useRouter();
  const [pendiente, empezar] = useTransition();
  return (
    <label className="flex items-center gap-2 text-tiny text-ink-2">
      <span>Ver como (solo desarrollo)</span>
      <select value={actual} disabled={pendiente} aria-label="Persona revisora de desarrollo"
        onChange={(e) => empezar(async () => { await cambiarRevisorDeDesarrollo(e.target.value); router.refresh(); })}
        className="glass cursor-pointer rounded-pill bg-transparent px-3 py-1.5 text-tiny text-white">
        {revisores.map((r) => <option key={r.userId} value={r.userId} className="text-black">{r.nombre}{r.rol === "admin_samgple" ? " (admin)" : ""}</option>)}
      </select>
    </label>
  );
}
