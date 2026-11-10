"use client";

import Link from "next/link";
import { Check, CircleCheck, CircleMinus, UserPlus, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { GlassPanel } from "@/components/glass";
import { completarAccionAccion, fichaSolicitudAccion, notaAccion, proximaAccionAccion } from "@/app/(admin)/admin/comercial/acciones";
import { COLUMNAS } from "@/lib/admin/comercial/config";
import type { FichaSolicitud } from "@/lib/admin/comercial/servicio";
import { useFocusTrap } from "@/lib/useFocusTrap";

const fecha = (iso: string) => new Date(iso).toLocaleString("es-ES", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
const dia = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });

function Consentimiento({ ok, texto }: { ok: boolean; texto: string }) {
  const Icono = ok ? CircleCheck : CircleMinus;
  return <li className={`flex items-center gap-2 text-small ${ok ? "" : "text-ink-2"}`}><Icono size={15} aria-hidden="true" className={ok ? "text-status-working" : "text-ink-3"} />{texto}: {ok ? "sí" : "no"}</li>;
}

/** Ficha de una solicitud: datos del formulario, consentimientos, notas y próximas acciones (fecha y responsable). */
export function FichaSolicitudDialogo({ id, onCerrar }: { id: string; onCerrar: () => void }) {
  const caja = useRef<HTMLDivElement>(null);
  const [ficha, setFicha] = useState<FichaSolicitud | null>(null);
  const [nota, setNota] = useState("");
  const [accion, setAccion] = useState({ texto: "", venceEn: "", responsable: "" });
  const [error, setError] = useState<string | null>(null);
  const [ocupado, empezar] = useTransition();
  useFocusTrap(caja);

  const cargar = useCallback(() => {
    void fichaSolicitudAccion(id).then((f) => {
      setFicha(f);
      if (f) setAccion((a) => ({ ...a, responsable: a.responsable || f.equipo[0]?.userId || "" }));
    });
  }, [id]);
  useEffect(() => { cargar(); }, [cargar]);
  useEffect(() => {
    const t = (e: KeyboardEvent) => e.key === "Escape" && onCerrar();
    window.addEventListener("keydown", t);
    return () => window.removeEventListener("keydown", t);
  }, [onCerrar]);

  const hacer = (fn: () => Promise<{ ok: boolean; mensaje?: string }>, limpiar?: () => void) =>
    empezar(async () => {
      const r = await fn();
      if (!r.ok) setError(r.mensaje ?? "No se pudo guardar.");
      else { setError(null); limpiar?.(); cargar(); }
    });

  const s = ficha?.solicitud;
  return (
    <div className="fixed inset-0 z-[60] flex justify-end bg-black/40" onClick={(e) => e.target === e.currentTarget && onCerrar()}>
      <div ref={caja} role="dialog" aria-modal="true" aria-labelledby="ficha-t" className="h-full w-full max-w-xl overflow-y-auto p-3">
        <GlassPanel strong className="flex min-h-full flex-col gap-5 p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-tiny text-ink-2">Solicitud · {s ? COLUMNAS.find((c) => c.id === s.estado)?.titulo : "…"}</p>
              <h2 id="ficha-t" className="text-h2">{s ? s.empresa ?? s.nombre : "Cargando…"}</h2>
            </div>
            <button type="button" onClick={onCerrar} aria-label="Cerrar ficha" autoFocus className="flex size-10 items-center justify-center rounded-full bg-white/10 hover:bg-white/15"><X size={18} aria-hidden="true" /></button>
          </div>

          {s && ficha && (
            <>
              <dl className="grid grid-cols-[8rem_1fr] gap-x-3 gap-y-1.5 text-small">
                <dt className="text-ink-2">Contacto</dt><dd>{s.nombre}</dd>
                <dt className="text-ink-2">Correo</dt><dd className="break-all">{s.email}</dd>
                {s.telefono && <><dt className="text-ink-2">Teléfono</dt><dd>{s.telefono}</dd></>}
                <dt className="text-ink-2">Sector</dt><dd>{s.sector ?? "—"}</dd>
                <dt className="text-ink-2">Tamaño</dt><dd>{s.tamano ? `${s.tamano} personas` : "—"}</dd>
                {s.web && <><dt className="text-ink-2">Web</dt><dd className="break-all">{s.web}</dd></>}
                <dt className="text-ink-2">Recibida</dt><dd>{fecha(s.creadoEn)} · {s.origen === "web" ? "formulario web" : "alta manual"}</dd>
              </dl>
              {s.mensaje && <blockquote className="rounded-card bg-black/25 p-3 text-small text-ink-2">«{s.mensaje}»</blockquote>}
              <div>
                <h3 className="text-small font-semibold">Consentimientos</h3>
                <ul className="mt-2 flex flex-col gap-1">
                  <Consentimiento ok={s.aceptaPrivacidad} texto="Política de privacidad" />
                  <Consentimiento ok={s.aceptaComunicaciones} texto="Comunicaciones comerciales" />
                </ul>
                {!s.aceptaComunicaciones && <p className="mt-1 text-tiny text-ink-3">Sin consentimiento: solo contactar para atender su solicitud, nada de campañas.</p>}
              </div>
              {ficha.demos.length > 0 && (
                <div>
                  <h3 className="text-small font-semibold">Demos</h3>
                  <ul className="mt-2 flex flex-col gap-1 text-small text-ink-2">{ficha.demos.map((d) => <li key={d.id}>{fecha(d.fecha)} · {d.estado}</li>)}</ul>
                </div>
              )}

              <div>
                <h3 className="text-small font-semibold">Próximas acciones</h3>
                <ul className="mt-2 flex flex-col gap-1.5">
                  {ficha.acciones.map((a) => (
                    <li key={a.id} className={`flex items-center gap-2 rounded-card bg-black/20 px-3 py-2 text-small ${a.hechaEn ? "text-ink-3 line-through" : ""}`}>
                      <span className="flex-1">{a.texto}<span className="block text-tiny text-ink-3 no-underline">{dia(a.venceEn)} · {a.responsable ?? "sin responsable"}</span></span>
                      {!a.hechaEn && (
                        <button type="button" disabled={ocupado} onClick={() => hacer(() => completarAccionAccion(a.id))} aria-label={`Marcar como hecha: ${a.texto}`} className="flex size-8 items-center justify-center rounded-full bg-white/10 hover:bg-white/15"><Check size={15} aria-hidden="true" /></button>
                      )}
                    </li>
                  ))}
                  {ficha.acciones.length === 0 && <li className="text-small text-ink-3">Ninguna todavía.</li>}
                </ul>
                <form
                  className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]"
                  onSubmit={(e) => { e.preventDefault(); hacer(() => proximaAccionAccion(id, accion), () => setAccion((a) => ({ ...a, texto: "", venceEn: "" }))); }}
                >
                  <label className="sr-only" htmlFor="acc-texto">Próxima acción</label>
                  <input id="acc-texto" required maxLength={300} value={accion.texto} onChange={(e) => setAccion({ ...accion, texto: e.target.value })} placeholder="Próxima acción (p. ej. llamar para la demo)" className="rounded-pill bg-white/10 px-3 py-2 text-small ring-1 ring-white/15 sm:col-span-2" />
                  <label className="sr-only" htmlFor="acc-fecha">Fecha</label>
                  <input id="acc-fecha" type="date" required value={accion.venceEn} onChange={(e) => setAccion({ ...accion, venceEn: e.target.value })} className="rounded-pill bg-white/10 px-3 py-2 text-small ring-1 ring-white/15 [color-scheme:dark]" />
                  <label className="sr-only" htmlFor="acc-resp">Responsable</label>
                  <select id="acc-resp" value={accion.responsable} onChange={(e) => setAccion({ ...accion, responsable: e.target.value })} className="rounded-pill bg-white/10 px-3 py-2 text-small ring-1 ring-white/15">
                    {ficha.equipo.map((p) => <option key={p.userId} value={p.userId} className="text-black">{p.nombre}</option>)}
                  </select>
                  <button type="submit" disabled={ocupado} className="rounded-pill bg-white/15 px-4 py-2 text-small font-semibold ring-1 ring-white/25 sm:col-span-2">Añadir acción</button>
                </form>
              </div>

              <div>
                <h3 className="text-small font-semibold">Notas</h3>
                <form className="mt-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); hacer(() => notaAccion(id, nota), () => setNota("")); }}>
                  <label className="sr-only" htmlFor="nota">Nueva nota</label>
                  <input id="nota" required maxLength={2000} value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Escribe una nota interna" className="min-w-0 flex-1 rounded-pill bg-white/10 px-3 py-2 text-small ring-1 ring-white/15" />
                  <button type="submit" disabled={ocupado} className="rounded-pill bg-white/15 px-4 py-2 text-small font-semibold ring-1 ring-white/25">Guardar</button>
                </form>
                <ul className="mt-3 flex flex-col gap-2">
                  {ficha.notas.map((n) => <li key={n.id} className="rounded-card bg-black/20 p-3 text-small">{n.texto}<span className="mt-1 block text-tiny text-ink-3">{n.autor ?? "—"} · {fecha(n.creadoEn)}</span></li>)}
                </ul>
              </div>

              {error && <p role="alert" className="text-small text-status-error">{error}</p>}
              {s.estado !== "cliente" && s.estado !== "descartada" && (
                <Link href={`/admin/comercial/alta?solicitud=${s.id}`} className="mt-auto inline-flex items-center justify-center gap-2 rounded-pill bg-white px-5 py-3 text-small font-semibold text-black">
                  <UserPlus size={16} aria-hidden="true" /> Crear cliente
                </Link>
              )}
            </>
          )}
        </GlassPanel>
      </div>
    </div>
  );
}
