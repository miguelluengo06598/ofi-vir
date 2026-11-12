"use client";

import Link from "next/link";
import { AlertTriangle, ArrowLeft, CheckCircle2, ExternalLink, FlaskConical, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { GlassPanel, PillButton } from "@/components/glass";
import type { AgenteParaLeads, EstadoMeta, LeadRecibido, PaginaMeta } from "@/lib/integraciones/meta/servicio";
import { avisoDePagina, hace, PERMISO, RESULTADO } from "./textos";

const CONECTAR = "/api/conexiones/meta_leads/iniciar";
/** La conexión empieza en una ruta de la API que redirige a Facebook: hace falta navegación completa, no el router. */
// eslint-disable-next-line @next/next/no-location-assign-relative-destination -- ruta de API que sale de la app
const conectarFacebook = () => window.location.assign(CONECTAR);
const selector = "glass w-full cursor-pointer rounded-pill bg-transparent px-3 py-2 text-small text-white disabled:cursor-not-allowed disabled:opacity-60";

/**
 * «Elige tus páginas y formularios»: de qué páginas de Facebook llegan contactos, de qué formularios y a qué agente.
 * Nunca recibe ni muestra credenciales: solo nombres, estados y avisos en lenguaje normal.
 */
export function FacebookLeadsView() {
  const [estado, setEstado] = useState<EstadoMeta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      const r = await fetch("/api/conexiones/meta", { cache: "no-store" });
      if (!r.ok) throw new Error();
      setEstado(await r.json());
      setError(null);
    } catch {
      setError("No se ha podido cargar la conexión con Facebook. Recarga la página.");
    }
  }, []);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const resultado = q.get("resultado");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resultado del regreso de Facebook, leído una vez de la URL
    if (resultado && RESULTADO[resultado]) setAviso(RESULTADO[resultado]);
    void cargar();
  }, [cargar]);

  /** Envía un cambio y pinta el estado que devuelve el servidor. `clave` marca qué control está trabajando. */
  const cambiar = async (clave: string, ruta: string, cuerpo: unknown) => {
    setOcupado(clave); setError(null);
    try {
      const r = await fetch(ruta, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(cuerpo) });
      const json = await r.json().catch(() => null);
      if (!r.ok) { setError(json?.mensaje ?? "No se ha podido guardar el cambio."); await cargar(); return; }
      setEstado(json);
    } catch {
      setError("No se ha podido guardar el cambio. Comprueba tu conexión a internet.");
    } finally {
      setOcupado(null);
    }
  };

  const conectado = estado?.conexion?.estado === "conectado";
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link href="/conexiones" className="inline-flex w-fit items-center gap-1.5 text-small text-ink-2 hover:text-white">
          <ArrowLeft size={15} aria-hidden="true" /> Aplicaciones conectadas
        </Link>
        <h1 className="text-h1">Elige tus páginas y formularios</h1>
        <p className="max-w-3xl text-body text-ink-2">
          Cuando alguien rellena el formulario de uno de tus anuncios de Facebook o Instagram, el contacto llega aquí y lo atiende el agente que elijas.
        </p>
      </div>

      {aviso && <p role="status" className="rounded-card bg-white/10 p-4 text-body">{aviso}</p>}
      {error && <p role="alert" className="rounded-card bg-red-500/15 p-4 text-body text-red-100">{error}</p>}
      {!estado && !error && <p role="status" className="text-body text-ink-2">Cargando…</p>}

      {estado && !conectado && (
        <GlassPanel className="flex flex-col gap-4 p-6">
          <h2 className="text-h2">{estado.conexion ? "Hay que volver a conectar Facebook" : "Conecta tu Facebook"}</h2>
          <p className="max-w-2xl text-body text-ink-2">
            Te llevaremos a Facebook para que elijas qué páginas quieres conectar. Hazlo con una cuenta que pueda anunciar en esas páginas. Solo pedimos lo
            necesario para recibir los contactos de tus formularios.
          </p>
          <div><PillButton solid onClick={conectarFacebook}>{estado.conexion ? "Volver a conectar" : "Conectar Facebook"}</PillButton></div>
        </GlassPanel>
      )}

      {estado && conectado && estado.conexion!.faltan.length > 0 && (
        <GlassPanel className="flex flex-col gap-3 p-6" style={{ boxShadow: "inset 0 0 0 1px rgba(251,191,36,0.55), var(--glass-shadow)" }}>
          <h2 className="flex items-center gap-2 text-h2"><AlertTriangle size={18} className="text-status-waiting" aria-hidden="true" /> {estado.conexion!.faltaImprescindible ? "Faltan permisos para recibir tus contactos" : "Falta algún permiso"}</h2>
          <p className="text-body text-ink-2">
            {estado.conexion!.faltaImprescindible
              ? "Al conectar no se aceptaron estos permisos, y sin ellos no podemos recibir nada:"
              : "Recibirás los contactos, pero sin este permiso no sabremos de qué anuncio viene cada uno:"}
          </p>
          <ul className="grid gap-1.5 text-body">
            {estado.conexion!.faltan.map((p) => <li key={p} className="flex gap-2"><span aria-hidden="true">·</span>{PERMISO[p] ?? p}</li>)}
          </ul>
          <div><PillButton solid onClick={conectarFacebook}>Volver a conectar y aceptarlos</PillButton></div>
        </GlassPanel>
      )}

      {estado && estado.enRevision.length > 0 && (
        <GlassPanel className="p-6">
          <h2 className="text-h2">Páginas en revisión</h2>
          <p className="mt-2 text-body text-ink-2">
            {estado.enRevision.join(", ")}: {estado.enRevision.length === 1 ? "esta página ya está conectada" : "estas páginas ya están conectadas"} a otra oficina, así que no la hemos
            conectado a la tuya. Nuestro equipo lo está revisando y te avisará.
          </p>
        </GlassPanel>
      )}

      {estado && conectado && !estado.conexion!.faltaImprescindible && (
        <>
          <p className="text-small text-ink-2">
            Conectado{estado.conexion!.cuenta ? ` como ${estado.conexion!.cuenta}` : ""}.{" "}
            <button type="button" className="underline underline-offset-4 hover:text-white" onClick={conectarFacebook}>Añadir o quitar páginas en Facebook</button>
          </p>
          {estado.paginas.length === 0 && <p className="text-body text-ink-2">No autorizaste ninguna página. Vuelve a conectar y elige al menos una.</p>}
          <ul className="grid gap-4">
            {estado.paginas.map((p) => (
              <li key={p.id}><Pagina p={p} estado={estado} ocupado={ocupado} cambiar={cambiar} /></li>
            ))}
          </ul>
        </>
      )}
      {estado?.conexion && estado.conexion.estado === "conectado" && <Desconectar conexionId={estado.conexion.id} alTerminar={async (mensaje) => { setAviso(mensaje); await cargar(); }} />}
    </div>
  );
}

/** «Desconectar Facebook»: deja de recibir leads de todas las páginas. Los contactos ya recibidos se quedan. */
function Desconectar({ conexionId, alTerminar }: { conexionId: string; alTerminar: (mensaje: string) => Promise<void> }) {
  const [confirmando, setConfirmando] = useState(false);
  const [trabajando, setTrabajando] = useState(false);
  const desconectar = async () => {
    setTrabajando(true);
    try {
      const r = await fetch(`/api/conexiones/${conexionId}/desconectar`, { method: "POST" });
      await alTerminar(r.ok ? "Facebook desconectado. Ya no recibirás leads de tus páginas; los contactos que ya tenías siguen en tu oficina." : "No se ha podido desconectar. Inténtalo de nuevo.");
    } catch {
      await alTerminar("No se ha podido desconectar. Comprueba tu conexión a internet.");
    } finally {
      setTrabajando(false);
      setConfirmando(false);
    }
  };
  return (
    <GlassPanel className="flex flex-col gap-3 p-5">
      <h2 className="text-h2">Desconectar Facebook</h2>
      {!confirmando ? (
        <>
          <p className="text-small text-ink-2">Dejarás de recibir leads de todas tus páginas. Los contactos que ya han llegado se quedan en tu oficina.</p>
          <div><PillButton onClick={() => setConfirmando(true)}>Desconectar Facebook</PillButton></div>
        </>
      ) : (
        <div role="alert" className="flex flex-col gap-3 rounded-card bg-red-500/12 p-4 ring-1 ring-red-300/35">
          <p className="text-body">¿Seguro? Quitaremos el aviso de leads de tus páginas y borraremos los permisos que nos diste. Para volver a recibir leads tendrás que conectar Facebook otra vez.</p>
          <div className="flex flex-wrap gap-2">
            <PillButton solid onClick={() => void desconectar()} disabled={trabajando}>{trabajando ? "Desconectando…" : "Sí, desconectar"}</PillButton>
            <PillButton onClick={() => setConfirmando(false)} disabled={trabajando}>Cancelar</PillButton>
          </div>
        </div>
      )}
    </GlassPanel>
  );
}

type Cambiar = (clave: string, ruta: string, cuerpo: unknown) => Promise<void>;

function Pagina({ p, estado, ocupado, cambiar }: { p: PaginaMeta; estado: EstadoMeta; ocupado: string | null; cambiar: Cambiar }) {
  const ruta = `/api/conexiones/meta/paginas/${p.id}`;
  const aviso = avisoDePagina(p.aviso, p.estado);
  const agenteDePagina = estado.agentes.find((a) => a.id === (p.agenteId ?? estado.agentePorDefecto)) ?? null;
  const sePuedeMarcar = p.estado === "activa" || p.estado === "sin_permiso_leads";
  const trabajando = ocupado === p.id;

  return (
    <GlassPanel className="flex flex-col gap-4 p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-h2">{p.nombre}</h2>
          <p className="mt-0.5 text-small text-ink-2">
            {p.recibiendo ? <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="size-2 rounded-full bg-status-working" /> Recibiendo contactos · último: {hace(p.ultimoLeadEn)}</span> : "Sin marcar: no recibimos sus contactos"}
          </p>
        </div>
        {sePuedeMarcar && (
          <label className="flex cursor-pointer items-center gap-2.5 text-small">
            <input
              type="checkbox" className="size-5 cursor-pointer accent-[#4F8CFF]" checked={p.recibiendo} disabled={trabajando}
              onChange={(e) => void cambiar(p.id, ruta, { recibir: e.target.checked })}
            />
            {trabajando ? "Guardando…" : "Recibir los contactos de esta página"}
          </label>
        )}
      </div>

      {aviso && (
        <div role="alert" className="flex flex-col gap-3 rounded-card bg-amber-400/12 p-4 text-body ring-1 ring-amber-300/35 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex gap-2"><AlertTriangle size={18} className="mt-0.5 shrink-0 text-status-waiting" aria-hidden="true" /> {aviso.texto}</p>
          {aviso.volverAConectar && <PillButton solid onClick={conectarFacebook}>Volver a conectar</PillButton>}
        </div>
      )}

      {p.recibiendo && (
        <>
          <div className="grid gap-2 sm:max-w-md">
            <label htmlFor={`agente-${p.id}`} className="text-small text-ink-2">Quién atiende los contactos de esta página</label>
            <SelectorDeAgente
              id={`agente-${p.id}`} agentes={estado.agentes} valor={p.agenteId ?? estado.agentePorDefecto ?? ""} deshabilitado={ocupado !== null}
              alCambiar={(agenteId) => void cambiar(`agente-${p.id}`, ruta, { agenteId })}
            />
            <AvisoDeAgente agente={agenteDePagina} hayAgentes={estado.agentes.length > 0} />
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-body font-semibold">Formularios</h3>
              <button type="button" disabled={ocupado !== null} onClick={() => void cambiar(`forms-${p.id}`, ruta, { actualizarFormularios: true })} className="inline-flex items-center gap-1.5 text-small text-ink-2 hover:text-white disabled:opacity-60">
                <RefreshCw size={14} aria-hidden="true" className={ocupado === `forms-${p.id}` ? "animate-spin motion-reduce:animate-none" : ""} /> Buscar formularios nuevos
              </button>
            </div>
            {p.formularios.length === 0 ? (
              <p className="text-small text-ink-2">Esta página todavía no tiene formularios de anuncios. Cuando crees uno, recibiremos sus contactos automáticamente.</p>
            ) : (
              <ul className="grid gap-2">
                {p.formularios.map((f) => (
                  <li key={f.id} className="grid gap-3 rounded-card bg-white/5 p-3 ring-1 ring-white/10 sm:grid-cols-[1fr_15rem] sm:items-center">
                    <label className="flex cursor-pointer items-start gap-2.5 text-body">
                      <input
                        type="checkbox" className="mt-0.5 size-5 shrink-0 cursor-pointer accent-[#4F8CFF]" checked={f.activo} disabled={ocupado !== null}
                        onChange={(e) => void cambiar(f.id, `/api/conexiones/meta/formularios/${f.id}`, { activo: e.target.checked })}
                      />
                      <span>
                        {f.nombre}
                        <span className="block text-tiny text-ink-3">{f.archivado ? "Archivado en Facebook · " : ""}último contacto: {hace(f.ultimoLeadEn)}</span>
                      </span>
                    </label>
                    {f.activo && (
                      <SelectorDeAgente
                        id={`agente-f-${f.id}`} etiqueta={`Quién atiende el formulario ${f.nombre}`} agentes={estado.agentes} valor={f.agenteId ?? ""} deshabilitado={ocupado !== null}
                        porDefecto={`El de la página${agenteDePagina ? ` (${agenteDePagina.nombre})` : ""}`}
                        alCambiar={(agenteId) => void cambiar(f.id, `/api/conexiones/meta/formularios/${f.id}`, { agenteId: agenteId || null })}
                      />
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <LeadDePrueba p={p} agente={agenteDePagina} ocupado={ocupado} cambiar={cambiar} />
        </>
      )}
    </GlassPanel>
  );
}

function SelectorDeAgente({ id, etiqueta, agentes, valor, porDefecto, deshabilitado, alCambiar }: {
  id: string; etiqueta?: string; agentes: AgenteParaLeads[]; valor: string; porDefecto?: string; deshabilitado: boolean; alCambiar: (agenteId: string) => void;
}) {
  return (
    <select id={id} aria-label={etiqueta} value={valor} disabled={deshabilitado || agentes.length === 0} onChange={(e) => alCambiar(e.target.value)} className={selector}>
      {porDefecto !== undefined ? <option value="" className="text-black">{porDefecto}</option> : !valor && <option value="" className="text-black">Elige un agente</option>}
      {agentes.map((a) => (
        <option key={a.id} value={a.id} className="text-black">{a.nombre} · {a.departamento}{a.puedeAtender ? "" : " (aún no activo)"}</option>
      ))}
    </select>
  );
}

function AvisoDeAgente({ agente, hayAgentes }: { agente: AgenteParaLeads | null; hayAgentes: boolean }) {
  if (!hayAgentes) return <p className="text-small text-status-waiting">Tu oficina todavía no tiene agentes. Los contactos se guardarán, pero nadie los atenderá hasta que haya uno activo.</p>;
  if (!agente) return <p className="text-small text-status-waiting">Elige un agente. Mientras tanto los contactos se guardan, pero nadie los atiende.</p>;
  if (!agente.puedeAtender) return <p className="text-small text-status-waiting">{agente.nombre} todavía no está certificado y activo: los contactos se guardarán, pero nadie los atenderá hasta que lo esté.</p>;
  return <p className="text-small text-ink-3">{agente.nombre} los atenderá en cuanto lleguen.</p>;
}

/** «Enviar lead de prueba»: explica cómo hacerlo en Facebook y enseña en directo cuándo llega. */
function LeadDePrueba({ p, agente, ocupado, cambiar }: { p: PaginaMeta; agente: AgenteParaLeads | null; ocupado: string | null; cambiar: Cambiar }) {
  const [prueba, setPrueba] = useState<{ desde: string; hasta: string; enlace: string } | null>(null);
  const [llegados, setLlegados] = useState<LeadRecibido[]>([]);
  const [fallo, setFallo] = useState<string | null>(null);
  const [abriendo, setAbriendo] = useState(false);
  const temporizador = useRef<ReturnType<typeof setInterval> | null>(null);
  const ruta = `/api/conexiones/meta/paginas/${p.id}`;

  const empezar = async () => {
    setAbriendo(true); setFallo(null); setLlegados([]);
    try {
      const r = await fetch(`${ruta}/prueba`, { method: "POST" });
      const json = await r.json().catch(() => null);
      if (!r.ok) { setFallo(json?.mensaje ?? "No se ha podido preparar la prueba."); return; }
      setPrueba(json);
    } catch {
      setFallo("No se ha podido preparar la prueba. Comprueba tu conexión a internet.");
    } finally {
      setAbriendo(false);
    }
  };

  // Mientras dura la prueba se pregunta cada pocos segundos qué ha llegado; al acabar el plazo, se deja de preguntar.
  useEffect(() => {
    if (!prueba) return;
    const mirar = async () => {
      if (Date.now() > new Date(prueba.hasta).getTime()) { if (temporizador.current) clearInterval(temporizador.current); return; }
      try {
        const r = await fetch(`${ruta}/prueba?desde=${encodeURIComponent(prueba.desde)}`, { cache: "no-store" });
        if (r.ok) setLlegados((await r.json()).leads);
      } catch { /* se vuelve a intentar en la siguiente vuelta */ }
    };
    void mirar();
    temporizador.current = setInterval(() => void mirar(), 4000);
    return () => { if (temporizador.current) clearInterval(temporizador.current); };
  }, [prueba, ruta]);

  return (
    <div className="flex flex-col gap-3 rounded-card bg-black/20 p-4 ring-1 ring-white/10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-body font-semibold"><FlaskConical size={17} aria-hidden="true" /> Comprueba que funciona</h3>
        <PillButton onClick={() => void empezar()} disabled={abriendo || ocupado !== null}>{abriendo ? "Preparando…" : prueba ? "Empezar otra prueba" : "Enviar lead de prueba"}</PillButton>
      </div>
      {fallo && <p role="alert" className="text-small text-red-100">{fallo}</p>}

      {prueba && (
        <>
          <ol className="grid list-decimal gap-1.5 pl-5 text-small text-ink-2">
            <li>Abre la <a href={prueba.enlace} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-white underline underline-offset-4">herramienta de pruebas de anuncios para clientes potenciales de Facebook <ExternalLink size={12} aria-hidden="true" /></a>.</li>
            <li>Elige la página <strong className="text-white">{p.nombre}</strong> y uno de los formularios que tienes marcados aquí.</li>
            <li>Pulsa «Crear cliente potencial» (si ya hay uno de prueba, bórralo antes con «Eliminar cliente potencial»).</li>
            <li>Vuelve a esta pantalla: aparecerá aquí abajo en unos segundos.</li>
          </ol>
          <div aria-live="polite" className="rounded-card bg-white/5 p-3 text-small">
            {llegados.length === 0 ? (
              <p className="flex items-center gap-2 text-ink-2"><span aria-hidden="true" className="size-2 animate-pulse rounded-full bg-status-waiting motion-reduce:animate-none" /> Esperando el contacto de prueba… (durante 15 minutos, lo que llegue a esta página se trata como prueba)</p>
            ) : (
              <ul className="grid gap-1.5">
                {llegados.map((l) => (
                  <li key={l.id} className="flex items-center gap-2">
                    <CheckCircle2 size={16} className="shrink-0 text-status-working" aria-hidden="true" />
                    Ha llegado un contacto{l.esPrueba ? " de prueba" : ""}{l.formulario ? ` del formulario «${l.formulario}»` : ""} a las {new Date(l.recibidoEn).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}.
                    {l.estado === "ignorado" && " No se atenderá: ese formulario no está marcado."}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}

      <label className="flex cursor-pointer items-start gap-2.5 text-small text-ink-2">
        <input
          type="checkbox" className="mt-0.5 size-4 shrink-0 cursor-pointer accent-[#4F8CFF]" checked={p.pruebasComoReales} disabled={ocupado !== null}
          onChange={(e) => void cambiar(`pruebas-${p.id}`, ruta, { pruebasComoReales: e.target.checked })}
        />
        <span>
          Quiero ver a {agente?.nombre ?? "mi agente"} en acción con los contactos de prueba.
          <span className="block text-tiny text-ink-3">Si no lo marcas, los de prueba solo se anotan: no gastan créditos ni se tratan como clientes reales.</span>
        </span>
      </label>
    </div>
  );
}
