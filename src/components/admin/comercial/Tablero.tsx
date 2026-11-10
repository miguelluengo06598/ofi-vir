"use client";

import Link from "next/link";
import { CalendarClock, MessageSquare, Plus, UserPlus } from "lucide-react";
import { useOptimistic, useState, useTransition } from "react";
import { GlassPanel } from "@/components/glass";
import { COLUMNAS, ESTADOS_MOVIBLES, type EstadoSolicitud } from "@/lib/admin/comercial/config";
import type { Solicitud } from "@/lib/admin/comercial/servicio";
import { moverSolicitudAccion } from "@/app/(admin)/admin/comercial/acciones";
import { FichaSolicitudDialogo } from "./FichaSolicitud";

const fecha = (iso: string) => new Date(iso).toLocaleDateString("es-ES", { day: "numeric", month: "short" });
const vencida = (dia: string) => dia < new Date().toISOString().slice(0, 10);

/**
 * Tablero de solicitudes por columnas. Arrastrar y soltar con ratón; con teclado, el selector «Mover a…» de cada
 * tarjeta hace lo mismo. A «Cliente» solo se llega con el asistente de alta. El cambio se ve al instante y se
 * deshace solo si el servidor lo rechaza.
 */
export function Tablero({ solicitudes }: { solicitudes: Solicitud[] }) {
  const [lista, mover] = useOptimistic(solicitudes, (actual, m: { id: string; estado: EstadoSolicitud }) =>
    actual.map((s) => (s.id === m.id ? { ...s, estado: m.estado } : s)));
  const [, empezar] = useTransition();
  const [arrastrando, setArrastrando] = useState<string | null>(null);
  const [encima, setEncima] = useState<EstadoSolicitud | null>(null);
  const [abierta, setAbierta] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const moverA = (id: string, estado: EstadoSolicitud) => {
    const s = lista.find((x) => x.id === id);
    if (!s || s.estado === estado) return;
    if (!ESTADOS_MOVIBLES.includes(estado) || s.estado === "cliente") {
      setAviso("A «Cliente» se llega con «Crear cliente», y una solicitud que ya es cliente no se mueve.");
      return;
    }
    empezar(async () => {
      mover({ id, estado });
      const r = await moverSolicitudAccion(id, estado);
      setAviso(r.ok ? `${s.empresa ?? s.nombre} → ${COLUMNAS.find((c) => c.id === estado)?.titulo}.` : r.mensaje);
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <p role="status" aria-live="polite" className="min-h-5 text-small text-ink-2">{aviso}</p>
      <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-4">
        {COLUMNAS.map((col) => {
          const tarjetas = lista.filter((s) => s.estado === col.id);
          return (
            <GlassPanel
              as="section"
              key={col.id}
              aria-labelledby={`col-${col.id}`}
              onDragOver={(e: React.DragEvent) => { if (arrastrando) { e.preventDefault(); setEncima(col.id); } }}
              onDragLeave={() => setEncima((c) => (c === col.id ? null : c))}
              onDrop={(e: React.DragEvent) => { e.preventDefault(); if (arrastrando) moverA(arrastrando, col.id); setArrastrando(null); setEncima(null); }}
              className={`flex w-72 shrink-0 snap-start flex-col gap-2 rounded-card! p-3 transition-colors ${encima === col.id ? "is-active ring-2 ring-[#D8B4FE]/70" : ""}`}
            >
              <h2 id={`col-${col.id}`} className="flex items-center justify-between px-1 text-small font-semibold">
                {col.titulo} <span className="rounded-pill bg-white/10 px-2 text-tiny text-ink-2">{tarjetas.length}</span>
              </h2>
              <ul className="flex min-h-24 flex-col gap-2">
                {tarjetas.map((s) => (
                  <li
                    key={s.id}
                    draggable={s.estado !== "cliente"}
                    onDragStart={(e) => { setArrastrando(s.id); e.dataTransfer.effectAllowed = "move"; }}
                    onDragEnd={() => { setArrastrando(null); setEncima(null); }}
                    className={`rounded-card bg-black/25 p-3 ring-1 ring-white/10 ${arrastrando === s.id ? "opacity-50" : ""} ${s.estado !== "cliente" ? "cursor-grab active:cursor-grabbing" : ""}`}
                  >
                    <button type="button" onClick={() => setAbierta(s.id)} className="block w-full text-left">
                      <span className="block text-small font-semibold">{s.empresa ?? s.nombre}</span>
                      <span className="block text-tiny text-ink-2">{s.nombre}{s.sector ? ` · ${s.sector}` : ""}</span>
                    </button>
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-tiny text-ink-3">
                      <span>{fecha(s.creadoEn)}{s.origen === "manual" ? " · manual" : ""}</span>
                      {s.notas > 0 && <span className="inline-flex items-center gap-1"><MessageSquare size={11} aria-hidden="true" />{s.notas}</span>}
                    </div>
                    {s.proximaAccion && (
                      <p className={`mt-1.5 flex items-start gap-1.5 text-tiny ${vencida(s.proximaAccion.venceEn) ? "text-status-waiting" : "text-ink-2"}`}>
                        <CalendarClock size={12} aria-hidden="true" className="mt-0.5 shrink-0" />
                        <span>{s.proximaAccion.texto} · {fecha(s.proximaAccion.venceEn)}{vencida(s.proximaAccion.venceEn) ? " (vencida)" : ""}</span>
                      </p>
                    )}
                    {s.estado !== "cliente" && (
                      <div className="mt-2 flex items-center gap-2">
                        <label className="sr-only" htmlFor={`mover-${s.id}`}>Mover {s.empresa ?? s.nombre} a</label>
                        <select
                          id={`mover-${s.id}`}
                          value=""
                          onChange={(e) => e.target.value && moverA(s.id, e.target.value as EstadoSolicitud)}
                          className="min-w-0 flex-1 rounded-pill bg-white/10 px-2 py-1 text-tiny ring-1 ring-white/15"
                        >
                          <option value="">Mover a…</option>
                          {COLUMNAS.filter((c) => ESTADOS_MOVIBLES.includes(c.id) && c.id !== s.estado).map((c) => <option key={c.id} value={c.id} className="text-black">{c.titulo}</option>)}
                        </select>
                        {s.estado !== "descartada" && (
                          <Link href={`/admin/comercial/alta?solicitud=${s.id}`} className="inline-flex shrink-0 items-center gap-1 rounded-pill bg-white px-2.5 py-1 text-tiny font-semibold text-black">
                            <UserPlus size={12} aria-hidden="true" /> Crear cliente
                          </Link>
                        )}
                      </div>
                    )}
                    {s.estado === "cliente" && s.companyId && (
                      <Link href={`/admin/clientes/${s.companyId}`} className="mt-2 inline-flex text-tiny underline underline-offset-4">Ver cliente</Link>
                    )}
                  </li>
                ))}
                {tarjetas.length === 0 && <li className="rounded-card border border-dashed border-white/15 p-4 text-center text-tiny text-ink-3">Sin solicitudes</li>}
              </ul>
            </GlassPanel>
          );
        })}
      </div>
      {abierta && <FichaSolicitudDialogo id={abierta} onCerrar={() => setAbierta(null)} />}
    </div>
  );
}

export function BotonAltaManual() {
  return (
    <Link href="/admin/comercial/alta" className="inline-flex items-center gap-2 rounded-pill bg-white px-4 py-2 text-small font-semibold text-black hover:bg-white/90">
      <Plus size={16} aria-hidden="true" /> Alta manual
    </Link>
  );
}
