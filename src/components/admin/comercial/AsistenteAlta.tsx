"use client";

import Link from "next/link";
import { ArrowLeft, ArrowRight, Check, CircleCheck, Copy, Plus, Trash2 } from "lucide-react";
import { useState, useTransition, type ReactNode } from "react";
import { GlassPanel } from "@/components/glass";
import { darDeAltaAccion } from "@/app/(admin)/admin/comercial/acciones";
import { DEPARTAMENTOS_ALTA, DIAS_REGALO_POR_DEFECTO, SECTORES, SERVICIOS_ALTA, TAMANOS } from "@/lib/admin/comercial/config";
import type { ResultadoAlta } from "@/lib/admin/comercial/alta";

export type InicialAlta = { solicitudId: string | null; empresa: string; sector: string; tamano: string; web: string; nombre: string; email: string };
type Pack = { id: string; nombre: string; creditos: number; dias: number };
type Plantilla = { id: string; nombre: string; rol: string; departamento: string };
type Persona = { userId: string; nombre: string };

const PASOS = ["Empresa", "Datos fiscales", "Propietario", "Servicios", "Punto de partida", "Créditos", "Responsable", "Resumen"];
const campo = "w-full rounded-pill bg-white/10 px-4 py-2.5 text-body ring-1 ring-white/20 focus:outline-2 focus:outline-white";
const eurACent = (v: string) => (v.trim() === "" ? null : Math.round(Number(v.replace(",", ".")) * 100));

function Campo({ etiqueta, ayuda, children }: { etiqueta: string; ayuda?: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-small font-semibold">{etiqueta}</span>
      {children}
      {ayuda && <span className="text-tiny text-ink-2">{ayuda}</span>}
    </label>
  );
}

/**
 * Asistente de alta de cliente (8 pasos). Se rellena con la solicitud si viene de una. Nada se guarda hasta
 * «Dar de alta», que lo crea todo en una transacción (o nada).
 */
export function AsistenteAlta({ inicial, packs, plantillas, equipo, yo }: { inicial: InicialAlta; packs: Pack[]; plantillas: Plantilla[]; equipo: Persona[]; yo: string }) {
  const [paso, setPaso] = useState(0);
  const [empresa, setEmpresa] = useState({ nombre: inicial.empresa, sector: inicial.sector, tamano: inicial.tamano, web: inicial.web });
  const [fiscalesDespues, setFiscalesDespues] = useState(true);
  const [fiscales, setFiscales] = useState({ razonSocial: "", nif: "", direccion: "", codigoPostal: "", ciudad: "", provincia: "", pais: "ES", emailFacturacion: "" });
  const [propietario, setPropietario] = useState({ nombre: inicial.nombre, email: inicial.email });
  const [miembros, setMiembros] = useState<{ email: string; rol: "admin" | "miembro" }[]>([]);
  const [servicios, setServicios] = useState<Record<string, { activo: boolean; importe: string }>>(Object.fromEntries(SERVICIOS_ALTA.map((s) => [s.id, { activo: s.id === "implantacion", importe: "" }])));
  const [departamentos, setDepartamentos] = useState<string[]>(["ventas", "atencion"]);
  const [elegidas, setElegidas] = useState<string[]>([]);
  const [creditos, setCreditos] = useState<{ origen: "pack" | "regalo" | "ninguno"; packId: string; cantidad: string; dias: string }>({ origen: "regalo", packId: packs.find((p) => p.id === "inicio")?.id ?? packs[0]?.id ?? "", cantidad: "1000", dias: String(DIAS_REGALO_POR_DEFECTO) });
  const [responsable, setResponsable] = useState(yo);
  const [objetivoFin, setObjetivoFin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<Extract<ResultadoAlta, { ok: true }> | null>(null);
  const [enviando, empezar] = useTransition();

  const alternarPlantilla = (p: Plantilla) => {
    setElegidas((e) => (e.includes(p.id) ? e.filter((x) => x !== p.id) : [...e, p.id]));
    // Montar un agente añade su departamento.
    setDepartamentos((d) => (d.includes(p.departamento) ? d : [...d, p.departamento]));
  };

  const datos = () => ({
    solicitudId: inicial.solicitudId,
    empresa: { nombre: empresa.nombre, sector: empresa.sector, tamano: empresa.tamano || null, web: empresa.web },
    fiscales: fiscalesDespues ? null : fiscales,
    propietario,
    miembros: miembros.filter((m) => m.email.trim()),
    servicios: SERVICIOS_ALTA.filter((s) => servicios[s.id].activo).map((s) => ({ servicio: s.id, importeCentimos: eurACent(servicios[s.id].importe) })),
    departamentos,
    plantillas: elegidas.filter((id) => departamentos.includes(plantillas.find((p) => p.id === id)?.departamento ?? "")),
    creditos: creditos.origen === "pack" ? { origen: "pack" as const, packId: creditos.packId }
      : creditos.origen === "regalo" ? { origen: "regalo" as const, creditos: Number(creditos.cantidad) || 0, diasCaducidad: Number(creditos.dias) || DIAS_REGALO_POR_DEFECTO }
      : { origen: "ninguno" as const },
    responsable,
    objetivoFin: objetivoFin || null,
  });

  /** Validación mínima por paso (la definitiva la hace el servidor con zod). */
  const faltan = (): string | null => {
    if (paso === 0 && empresa.nombre.trim().length < 2) return "Escribe el nombre de la empresa.";
    if (paso === 1 && !fiscalesDespues && (!fiscales.razonSocial || !fiscales.nif || !fiscales.direccion || !fiscales.codigoPostal || !fiscales.ciudad || !fiscales.emailFacturacion)) return "Completa los datos fiscales o márcalos para después.";
    if (paso === 2 && (!propietario.nombre.trim() || !/^\S+@\S+\.\S+$/.test(propietario.email))) return "El propietario necesita nombre y un correo válido.";
    if (paso === 4 && departamentos.length === 0) return "Elige al menos un departamento.";
    if (paso === 5 && creditos.origen === "regalo" && !(Number(creditos.cantidad) > 0)) return "Indica cuántos créditos regalas.";
    return null;
  };
  const siguiente = () => { const f = faltan(); setError(f); if (!f) setPaso((p) => Math.min(PASOS.length - 1, p + 1)); };

  const darDeAlta = () => empezar(async () => {
    const r = await darDeAltaAccion(datos());
    if (r.ok) { setResultado(r); setError(null); } else setError(r.mensaje);
  });

  if (resultado) {
    return (
      <GlassPanel className="flex flex-col gap-5 p-6 sm:p-8">
        <p className="flex items-center gap-2 text-h2"><CircleCheck size={24} aria-hidden="true" className="text-status-working" /> {empresa.nombre} está dada de alta</p>
        <p className="text-body text-ink-2">Se han creado la empresa, sus departamentos, los agentes en borrador, los créditos, la lista de implantación y las invitaciones.</p>
        <ul className="flex flex-col gap-2">
          {resultado.correos.map((c) => (
            <li key={c.email} className="rounded-card bg-black/25 p-4 text-small">
              <p className="font-semibold">{c.propietario ? "Propietario" : "Miembro"} · {c.email}</p>
              <p className={c.enviado ? "text-status-working" : "text-status-waiting"}>{c.enviado ? "Correo de bienvenida enviado." : `Correo no enviado: ${c.motivo}`}</p>
              {c.enlace && (
                <p className="mt-2 flex flex-wrap items-center gap-2 text-tiny text-ink-2">
                  Enlace (solo en desarrollo): <code className="break-all text-white">{c.enlace}</code>
                  <button type="button" onClick={() => void navigator.clipboard.writeText(c.enlace!)} className="inline-flex items-center gap-1 rounded-pill bg-white/10 px-2 py-1"><Copy size={12} aria-hidden="true" /> Copiar</button>
                </p>
              )}
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-2">
          <Link href={`/admin/clientes/${resultado.companyId}`} className="rounded-pill bg-white px-5 py-2.5 text-small font-semibold text-black">Ver la ficha del cliente</Link>
          <Link href="/admin/comercial" className="rounded-pill bg-white/10 px-5 py-2.5 text-small ring-1 ring-white/25">Volver al tablero</Link>
        </div>
      </GlassPanel>
    );
  }

  const d = datos();
  return (
    <div className="flex flex-col gap-4">
      <ol aria-label="Pasos del alta" className="flex flex-wrap gap-1.5">
        {PASOS.map((p, i) => (
          <li key={p}>
            <button type="button" onClick={() => i < paso && setPaso(i)} disabled={i > paso} aria-current={i === paso ? "step" : undefined}
              className={`inline-flex items-center gap-1.5 rounded-pill px-3 py-1.5 text-tiny ring-1 ${i === paso ? "bg-white font-semibold text-black ring-white" : i < paso ? "bg-white/15 ring-white/25" : "text-ink-3 ring-white/10"}`}>
              {i < paso ? <Check size={12} aria-hidden="true" /> : <span aria-hidden="true">{i + 1}</span>} {p}
            </button>
          </li>
        ))}
      </ol>

      <GlassPanel as="form" onSubmit={(e: React.FormEvent) => { e.preventDefault(); if (paso < PASOS.length - 1) siguiente(); else darDeAlta(); }} className="flex flex-col gap-5 p-6 sm:p-8">
        <h2 className="text-h2">{PASOS[paso]}</h2>

        {paso === 0 && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo etiqueta="Nombre de la empresa"><input required className={campo} value={empresa.nombre} onChange={(e) => setEmpresa({ ...empresa, nombre: e.target.value })} /></Campo>
            <Campo etiqueta="Sector">
              <select className={campo} value={empresa.sector} onChange={(e) => setEmpresa({ ...empresa, sector: e.target.value })}>
                <option value="" className="text-black">Sin indicar</option>
                {[...new Set([...SECTORES, empresa.sector].filter(Boolean))].map((s) => <option key={s} value={s} className="text-black">{s}</option>)}
              </select>
            </Campo>
            <Campo etiqueta="Tamaño">
              <select className={campo} value={empresa.tamano} onChange={(e) => setEmpresa({ ...empresa, tamano: e.target.value })}>
                <option value="" className="text-black">Sin indicar</option>
                {TAMANOS.map((t) => <option key={t} value={t} className="text-black">{t} personas</option>)}
              </select>
            </Campo>
            <Campo etiqueta="Web"><input className={campo} value={empresa.web} onChange={(e) => setEmpresa({ ...empresa, web: e.target.value })} placeholder="https://" /></Campo>
          </div>
        )}

        {paso === 1 && (
          <div className="flex flex-col gap-4">
            <label className="flex items-center gap-3 text-body">
              <input type="checkbox" checked={fiscalesDespues} onChange={(e) => setFiscalesDespues(e.target.checked)} className="size-5" />
              Dejarlos para después (quedará la tarea «Completar los datos fiscales»)
            </label>
            {!fiscalesDespues && (
              <div className="grid gap-4 sm:grid-cols-2">
                <Campo etiqueta="Razón social"><input className={campo} value={fiscales.razonSocial} onChange={(e) => setFiscales({ ...fiscales, razonSocial: e.target.value })} /></Campo>
                <Campo etiqueta="NIF / CIF"><input className={campo} value={fiscales.nif} onChange={(e) => setFiscales({ ...fiscales, nif: e.target.value })} /></Campo>
                <Campo etiqueta="Dirección"><input className={campo} value={fiscales.direccion} onChange={(e) => setFiscales({ ...fiscales, direccion: e.target.value })} /></Campo>
                <Campo etiqueta="Código postal"><input className={campo} value={fiscales.codigoPostal} onChange={(e) => setFiscales({ ...fiscales, codigoPostal: e.target.value })} /></Campo>
                <Campo etiqueta="Ciudad"><input className={campo} value={fiscales.ciudad} onChange={(e) => setFiscales({ ...fiscales, ciudad: e.target.value })} /></Campo>
                <Campo etiqueta="Provincia"><input className={campo} value={fiscales.provincia} onChange={(e) => setFiscales({ ...fiscales, provincia: e.target.value })} /></Campo>
                <Campo etiqueta="País (código)"><input className={campo} maxLength={2} value={fiscales.pais} onChange={(e) => setFiscales({ ...fiscales, pais: e.target.value.toUpperCase() })} /></Campo>
                <Campo etiqueta="Correo de facturación"><input type="email" className={campo} value={fiscales.emailFacturacion} onChange={(e) => setFiscales({ ...fiscales, emailFacturacion: e.target.value })} /></Campo>
              </div>
            )}
          </div>
        )}

        {paso === 2 && (
          <div className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Campo etiqueta="Nombre del propietario"><input required className={campo} value={propietario.nombre} onChange={(e) => setPropietario({ ...propietario, nombre: e.target.value })} /></Campo>
              <Campo etiqueta="Correo del propietario" ayuda="Recibirá la invitación como propietario."><input type="email" required className={campo} value={propietario.email} onChange={(e) => setPropietario({ ...propietario, email: e.target.value })} /></Campo>
            </div>
            <div>
              <p className="text-small font-semibold">Más personas a invitar (opcional)</p>
              <ul className="mt-2 flex flex-col gap-2">
                {miembros.map((m, i) => (
                  <li key={i} className="flex gap-2">
                    <label className="sr-only" htmlFor={`m-${i}`}>Correo</label>
                    <input id={`m-${i}`} type="email" className={campo} value={m.email} onChange={(e) => setMiembros(miembros.map((x, k) => (k === i ? { ...x, email: e.target.value } : x)))} placeholder="correo@empresa.com" />
                    <label className="sr-only" htmlFor={`r-${i}`}>Rol</label>
                    <select id={`r-${i}`} className="rounded-pill bg-white/10 px-3 text-small ring-1 ring-white/20" value={m.rol} onChange={(e) => setMiembros(miembros.map((x, k) => (k === i ? { ...x, rol: e.target.value as "admin" | "miembro" } : x)))}>
                      <option value="admin" className="text-black">Administrador</option><option value="miembro" className="text-black">Miembro</option>
                    </select>
                    <button type="button" aria-label="Quitar" onClick={() => setMiembros(miembros.filter((_, k) => k !== i))} className="flex size-11 shrink-0 items-center justify-center rounded-full bg-white/10"><Trash2 size={16} aria-hidden="true" /></button>
                  </li>
                ))}
              </ul>
              <button type="button" onClick={() => setMiembros([...miembros, { email: "", rol: "miembro" }])} className="mt-2 inline-flex items-center gap-1.5 rounded-pill bg-white/10 px-3 py-2 text-small"><Plus size={14} aria-hidden="true" /> Añadir persona</button>
            </div>
          </div>
        )}

        {paso === 3 && (
          <div className="flex flex-col gap-3">
            <p className="text-small text-ink-2">Solo se registran: la factura de servicios se gestiona aparte. Importes sin IVA.</p>
            {SERVICIOS_ALTA.map((s) => (
              <div key={s.id} className="flex flex-wrap items-center gap-3 rounded-card bg-black/20 p-3">
                <label className="flex flex-1 items-center gap-3 text-body">
                  <input type="checkbox" className="size-5" checked={servicios[s.id].activo} onChange={(e) => setServicios({ ...servicios, [s.id]: { ...servicios[s.id], activo: e.target.checked } })} />
                  {s.nombre}{s.periodicidad === "mensual" ? " (mensual)" : ""}
                </label>
                {servicios[s.id].activo && (
                  <label className="flex items-center gap-2 text-small">
                    <span className="text-ink-2">Importe</span>
                    <input inputMode="decimal" className="w-28 rounded-pill bg-white/10 px-3 py-1.5 text-right ring-1 ring-white/20" value={servicios[s.id].importe} onChange={(e) => setServicios({ ...servicios, [s.id]: { ...servicios[s.id], importe: e.target.value } })} placeholder="0" />
                    <span className="text-ink-2">€{s.periodicidad === "mensual" ? "/mes" : ""}</span>
                  </label>
                )}
              </div>
            ))}
          </div>
        )}

        {paso === 4 && (
          <div className="grid gap-6 md:grid-cols-2">
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 text-small font-semibold">Departamentos</legend>
              {DEPARTAMENTOS_ALTA.map((x) => (
                <label key={x.slug} className="flex items-center gap-3 text-body">
                  <input type="checkbox" className="size-5" checked={departamentos.includes(x.slug)} onChange={(e) => setDepartamentos(e.target.checked ? [...departamentos, x.slug] : departamentos.filter((s) => s !== x.slug))} />
                  {x.nombre}
                </label>
              ))}
            </fieldset>
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 text-small font-semibold">Agentes de plantilla (en borrador)</legend>
              {plantillas.length === 0 && <p className="text-small text-ink-2">No hay plantillas certificadas disponibles.</p>}
              {plantillas.map((p) => (
                <label key={p.id} className="flex items-start gap-3 text-body">
                  <input type="checkbox" className="mt-1 size-5" checked={elegidas.includes(p.id)} onChange={() => alternarPlantilla(p)} />
                  <span>{p.nombre}<span className="block text-small text-ink-2">{p.rol} · {DEPARTAMENTOS_ALTA.find((x) => x.slug === p.departamento)?.nombre}</span></span>
                </label>
              ))}
              <p className="mt-2 text-tiny text-ink-3">Con esto se genera la lista de tareas de implantación (configurar, conectar sus aplicaciones, probar y certificar).</p>
            </fieldset>
          </div>
        )}

        {paso === 5 && (
          <fieldset className="flex flex-col gap-3">
            <legend className="sr-only">Créditos iniciales</legend>
            <label className="flex items-center gap-3 text-body"><input type="radio" name="cred" checked={creditos.origen === "pack"} onChange={() => setCreditos({ ...creditos, origen: "pack" })} className="size-5" /> Pack incluido en la implantación</label>
            {creditos.origen === "pack" && (
              <select className={campo} value={creditos.packId} onChange={(e) => setCreditos({ ...creditos, packId: e.target.value })}>
                {packs.map((p) => <option key={p.id} value={p.id} className="text-black">{p.nombre} · {p.creditos.toLocaleString("es-ES")} créditos · caducan a los {p.dias} días</option>)}
              </select>
            )}
            <label className="flex items-center gap-3 text-body"><input type="radio" name="cred" checked={creditos.origen === "regalo"} onChange={() => setCreditos({ ...creditos, origen: "regalo" })} className="size-5" /> Regalo de bienvenida</label>
            {creditos.origen === "regalo" && (
              <div className="grid gap-3 sm:grid-cols-2">
                <Campo etiqueta="Créditos"><input inputMode="numeric" className={campo} value={creditos.cantidad} onChange={(e) => setCreditos({ ...creditos, cantidad: e.target.value.replace(/\D/g, "") })} /></Campo>
                <Campo etiqueta="Caducan a los (días)"><input inputMode="numeric" className={campo} value={creditos.dias} onChange={(e) => setCreditos({ ...creditos, dias: e.target.value.replace(/\D/g, "") })} /></Campo>
              </div>
            )}
            <label className="flex items-center gap-3 text-body"><input type="radio" name="cred" checked={creditos.origen === "ninguno"} onChange={() => setCreditos({ ...creditos, origen: "ninguno" })} className="size-5" /> Sin créditos iniciales</label>
            <p className="text-tiny text-ink-3">El lote se crea al dar de alta.</p>
          </fieldset>
        )}

        {paso === 6 && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo etiqueta="Responsable de MyOfia" ayuda="Aparece en el correo de bienvenida.">
              <select className={campo} value={responsable} onChange={(e) => setResponsable(e.target.value)}>
                {equipo.map((p) => <option key={p.userId} value={p.userId} className="text-black">{p.nombre}</option>)}
              </select>
            </Campo>
            <Campo etiqueta="Fecha objetivo de la implantación (opcional)"><input type="date" className={`${campo} [color-scheme:dark]`} value={objetivoFin} onChange={(e) => setObjetivoFin(e.target.value)} /></Campo>
          </div>
        )}

        {paso === 7 && (
          <dl className="grid gap-x-4 gap-y-2 text-small sm:grid-cols-[12rem_1fr]">
            <dt className="text-ink-2">Empresa</dt><dd>{d.empresa.nombre}{d.empresa.sector ? ` · ${d.empresa.sector}` : ""}{d.empresa.tamano ? ` · ${d.empresa.tamano} personas` : ""}</dd>
            <dt className="text-ink-2">Datos fiscales</dt><dd>{d.fiscales ? `${d.fiscales.razonSocial} · ${d.fiscales.nif}` : "Para después (tarea pendiente)"}</dd>
            <dt className="text-ink-2">Propietario</dt><dd>{d.propietario.nombre} · {d.propietario.email}</dd>
            <dt className="text-ink-2">Más invitaciones</dt><dd>{d.miembros.length ? d.miembros.map((m) => `${m.email} (${m.rol})`).join(", ") : "Ninguna"}</dd>
            <dt className="text-ink-2">Servicios</dt><dd>{d.servicios.length ? d.servicios.map((s) => `${SERVICIOS_ALTA.find((x) => x.id === s.servicio)?.nombre}${s.importeCentimos !== null ? ` (${(s.importeCentimos / 100).toLocaleString("es-ES")} €)` : ""}`).join(", ") : "Ninguno"}</dd>
            <dt className="text-ink-2">Departamentos</dt><dd>{DEPARTAMENTOS_ALTA.filter((x) => d.departamentos.includes(x.slug)).map((x) => x.nombre).join(", ")}</dd>
            <dt className="text-ink-2">Agentes</dt><dd>{d.plantillas.length ? d.plantillas.map((id) => plantillas.find((p) => p.id === id)?.nombre).join(", ") : "Ninguno"}</dd>
            <dt className="text-ink-2">Créditos</dt><dd>{d.creditos.origen === "pack" ? `Pack ${packs.find((p) => p.id === creditos.packId)?.nombre}` : d.creditos.origen === "regalo" ? `${Number(creditos.cantidad).toLocaleString("es-ES")} de regalo, ${creditos.dias} días` : "Sin créditos"}</dd>
            <dt className="text-ink-2">Responsable</dt><dd>{equipo.find((p) => p.userId === responsable)?.nombre}</dd>
          </dl>
        )}

        {error && <p role="alert" className="rounded-card bg-status-error/15 px-4 py-2 text-small text-status-error">{error}</p>}

        <div className="flex flex-wrap justify-between gap-2 border-t border-white/10 pt-4">
          <button type="button" disabled={paso === 0} onClick={() => { setError(null); setPaso((p) => p - 1); }} className="inline-flex items-center gap-2 rounded-pill bg-white/10 px-5 py-2.5 text-small ring-1 ring-white/25 disabled:opacity-40">
            <ArrowLeft size={16} aria-hidden="true" /> Atrás
          </button>
          <button type="submit" disabled={enviando} className="inline-flex items-center gap-2 rounded-pill bg-white px-5 py-2.5 text-small font-semibold text-black disabled:opacity-60">
            {paso < PASOS.length - 1 ? <>Siguiente <ArrowRight size={16} aria-hidden="true" /></> : enviando ? "Dando de alta…" : "Dar de alta"}
          </button>
        </div>
      </GlassPanel>
    </div>
  );
}
