"use client";

import Link from "next/link";
import { AlertTriangle, ArrowRight } from "lucide-react";
import { useEffect, useState } from "react";
import type { EstadoMeta } from "@/lib/integraciones/meta/servicio";
import { avisoDePagina, hace } from "./textos";

/**
 * Resumen de Facebook en «Aplicaciones conectadas»: páginas que reciben contactos, el último que llegó y los avisos.
 * El detalle (marcar páginas, formularios, agente, prueba) está en /conexiones/facebook.
 */
export function ResumenFacebook() {
  const [estado, setEstado] = useState<EstadoMeta | null>(null);

  useEffect(() => {
    let vivo = true;
    void fetch("/api/conexiones/meta", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((e) => { if (vivo) setEstado(e); })
      .catch(() => {});
    return () => { vivo = false; };
  }, []);

  if (!estado?.conexion || estado.conexion.estado !== "conectado") return null;
  const recibiendo = estado.paginas.filter((p) => p.recibiendo);
  const ultimo = recibiendo.map((p) => p.ultimoLeadEn).filter(Boolean).sort().at(-1) ?? null;
  const avisos = [
    ...(estado.conexion.faltaImprescindible ? ["Faltan permisos para recibir tus contactos: vuelve a conectar."] : []),
    ...estado.paginas.map((p) => { const a = avisoDePagina(p.aviso, p.estado); return a && p.estado !== "desconectada" ? `${p.nombre}: ${a.texto}` : null; }).filter((x): x is string => x !== null),
    ...(estado.enRevision.length ? [`${estado.enRevision.join(", ")}: en revisión por nuestro equipo.`] : []),
  ];

  return (
    <div className="flex flex-col gap-2 text-small">
      <p className="text-ink-2">
        {recibiendo.length === 0
          ? "Todavía no recibes contactos de ninguna página."
          : `Recibiendo de ${recibiendo.map((p) => p.nombre).join(", ")} · último contacto: ${hace(ultimo)}`}
      </p>
      {avisos.slice(0, 3).map((a) => (
        <p key={a} role="alert" className="flex gap-2 rounded-card bg-amber-400/12 p-2.5 ring-1 ring-amber-300/35">
          <AlertTriangle size={15} className="mt-0.5 shrink-0 text-status-waiting" aria-hidden="true" /> {a}
        </p>
      ))}
      <Link href="/conexiones/facebook" className="inline-flex w-fit items-center gap-1.5 text-white underline underline-offset-4">
        {recibiendo.length === 0 ? "Elegir páginas y formularios" : "Páginas, formularios y agente"} <ArrowRight size={14} aria-hidden="true" />
      </Link>
    </div>
  );
}
