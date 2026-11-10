"use client";

import { Plus } from "lucide-react";
import { useCallback, useEffect, useId, useState } from "react";
import { useCreditos } from "./CreditosProvider";
import { Aviso, Seccion, Vacio } from "./partes";
import { GlassInput, PillButton } from "@/components/glass";
import { llamar } from "@/components/oficina/llamar";
import { NOMBRE_FRECUENCIA, NOMBRE_TIPO_TAREA, creditosAEur } from "@/lib/creditos/tipos";
import { fmtEur, fmtNumber } from "@/lib/format";

type TipoTarea = "simple" | "estandar" | "experta";
type Rutina = {
  id: string; agente: string; nombre: string; descripcion: string | null; tipoTarea: TipoTarea; frecuencia: string; activa: boolean;
  activadaPor: string | null; activadaEn: string | null; maxEjecucionesMes: number; ejecucionesEsteMes: number; costeMensualEstimado: number;
};
type Sugerida = { clave: string; agente: string; nombre: string; descripcion: string; tipoTarea: TipoTarea; frecuencia: string; maxEjecucionesMes: number; costeMensualEstimado: number };
type Datos = { rutinas: Rutina[]; sugeridas: Sugerida[]; agentes: { id: string; nombre: string }[] };

const FRECUENCIAS = ["diaria", "laborables", "semanal", "mensual"] as const;
const coste = (c: number) => `${fmtNumber(c)} créditos/mes (≈ ${fmtEur(creditosAEur(c))})`;
const FECHA = (iso: string) => new Date(iso).toLocaleDateString("es-ES", { day: "numeric", month: "long" });

/**
 * Rutinas: trabajo periódico que una PERSONA crea y activa. Nacen desactivadas; al activarlas se muestra el coste estimado al mes y
 * queda registrado quién las activó. Cada una tiene un límite de ejecuciones al mes. Las plantillas solo las sugieren.
 */
export function RutinasPanel() {
  const { recargar } = useCreditos();
  const [datos, setDatos] = useState<Datos | null>(null);
  const [msg, setMsg] = useState<{ tono: "ok" | "error"; texto: string } | null>(null);
  const [confirmar, setConfirmar] = useState<string | null>(null);
  const [nueva, setNueva] = useState(false);

  const cargar = useCallback(() => llamar<Datos>("/api/rutinas").then((r) => (r.ok ? setDatos(r.datos) : setMsg({ tono: "error", texto: r.mensaje }))), []);
  useEffect(() => { void llamar<Datos>("/api/rutinas").then((r) => (r.ok ? setDatos(r.datos) : setMsg({ tono: "error", texto: r.mensaje }))); }, []);

  async function accion(ruta: string, metodo: "POST" | "DELETE", cuerpo: unknown, ok: string) {
    setMsg(null);
    const r = await llamar(ruta, metodo, cuerpo);
    setMsg(r.ok ? { tono: "ok", texto: ok } : { tono: "error", texto: r.mensaje });
    setConfirmar(null);
    await cargar();
    void recargar();
  }

  if (!datos) return msg ? <Seccion id="rutinas" titulo="Rutinas"><Aviso tono="error">{msg.texto}</Aviso></Seccion> : null;
  const activas = datos.rutinas.filter((r) => r.activa);
  const total = activas.reduce((n, r) => n + r.costeMensualEstimado, 0);
  return (
    <Seccion id="rutinas" titulo="Rutinas" acciones={activas.length > 0 ? <p className="text-small text-ink-2">Activas: <strong className="text-white">{coste(total)}</strong></p> : undefined}>
      <p className="text-small text-ink-2">Trabajo periódico de un agente (un informe, una revisión). Solo lo creáis y activáis vosotros: nacen desactivadas y cada una tiene un límite de ejecuciones al mes.</p>
      {datos.rutinas.length === 0 ? <Vacio>No tenéis rutinas. Ningún agente hace trabajo periódico por su cuenta.</Vacio> : (
        <ul className="flex flex-col gap-2">
          {datos.rutinas.map((r) => (
            <li key={r.id} className="flex flex-col gap-2 rounded-card bg-white/6 p-3 text-small">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <span className="min-w-0">
                  <span className="font-semibold">{r.nombre}</span> <span className="text-ink-2">· {r.agente}</span>
                  <span className="block text-tiny text-ink-3">
                    Tarea {NOMBRE_TIPO_TAREA[r.tipoTarea].toLowerCase()} · {NOMBRE_FRECUENCIA[r.frecuencia] ?? r.frecuencia} · máx. {r.maxEjecucionesMes} al mes ({r.ejecucionesEsteMes} este mes)
                  </span>
                  <span className="block text-tiny text-ink-3">
                    {r.activa ? `Activa · la activó ${r.activadaPor ?? "una persona"}${r.activadaEn ? ` el ${FECHA(r.activadaEn)}` : ""}` : "Desactivada: no se ejecuta"}
                  </span>
                </span>
                <span className="shrink-0 font-semibold">≈ {coste(r.costeMensualEstimado)}</span>
              </div>
              {confirmar === r.id ? (
                <div className="flex flex-wrap items-center gap-2 rounded-card border border-status-waiting/60 bg-status-waiting/15 p-3">
                  <p className="flex-1 basis-60">Esto gastará hasta <strong>{coste(r.costeMensualEstimado)}</strong>. ¿Activarla?</p>
                  <PillButton solid onClick={() => void accion(`/api/rutinas/${r.id}`, "POST", { accion: "activar", costeConfirmado: r.costeMensualEstimado }, `«${r.nombre}» activada.`)}>Sí, activar</PillButton>
                  <PillButton onClick={() => setConfirmar(null)}>Cancelar</PillButton>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {r.activa
                    ? <PillButton compact onClick={() => void accion(`/api/rutinas/${r.id}`, "POST", { accion: "desactivar" }, `«${r.nombre}» desactivada.`)}>Desactivar</PillButton>
                    : <PillButton compact onClick={() => setConfirmar(r.id)}>Activar…</PillButton>}
                  <PillButton compact onClick={() => void accion(`/api/rutinas/${r.id}`, "DELETE", undefined, `«${r.nombre}» borrada.`)}>Borrar</PillButton>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {datos.sugeridas.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-small font-semibold">Rutinas sugeridas por las plantillas</h3>
          <ul className="flex flex-col gap-2">
            {datos.sugeridas.map((s) => (
              <li key={s.clave} className="flex flex-wrap items-center justify-between gap-2 rounded-card border border-glass-border p-3 text-small">
                <span className="min-w-0 flex-1 basis-60">
                  <span className="font-semibold">{s.nombre}</span> <span className="text-ink-2">· {s.agente}</span>
                  <span className="block text-tiny text-ink-3">{s.descripcion} {NOMBRE_FRECUENCIA[s.frecuencia] ?? s.frecuencia}, máx. {s.maxEjecucionesMes} al mes · ≈ {coste(s.costeMensualEstimado)}</span>
                </span>
                <PillButton compact icon={Plus} onClick={() => void accion("/api/rutinas", "POST", { sugerida: s.clave }, `«${s.nombre}» añadida (desactivada). Actívala si la quieres.`)}>Añadir (desactivada)</PillButton>
              </li>
            ))}
          </ul>
        </div>
      )}

      {nueva ? <NuevaRutina agentes={datos.agentes} alTerminar={(texto) => { setNueva(false); if (texto) void accion("/api/rutinas", "POST", texto, "Rutina creada (desactivada). Actívala para que se ejecute."); }} />
        : datos.agentes.length > 0 && <div><PillButton icon={Plus} onClick={() => setNueva(true)}>Nueva rutina</PillButton></div>}
      {msg && <Aviso tono={msg.tono}>{msg.texto}</Aviso>}
    </Seccion>
  );
}

function NuevaRutina({ agentes, alTerminar }: { agentes: { id: string; nombre: string }[]; alTerminar: (cuerpo: Record<string, unknown> | null) => void }) {
  const id = useId();
  const [agenteId, setAgenteId] = useState(agentes[0]?.id ?? "");
  const [nombre, setNombre] = useState("");
  const [instruccion, setInstruccion] = useState("");
  const [tipoTarea, setTipoTarea] = useState<TipoTarea>("simple");
  const [frecuencia, setFrecuencia] = useState<(typeof FRECUENCIAS)[number]>("semanal");
  const [max, setMax] = useState("5");
  const maxN = /^\d+$/.test(max) ? Number(max) : NaN;
  const valida = agenteId && nombre.trim() && instruccion.trim() && maxN >= 1 && maxN <= 744;
  const sel = "glass cursor-pointer rounded-pill bg-transparent px-4 py-2 text-small text-white";
  return (
    <form className="flex flex-col gap-3 rounded-card border border-glass-border p-4" onSubmit={(e) => { e.preventDefault(); if (valida) alTerminar({ agenteId, nombre, instruccion, tipoTarea, frecuencia, maxEjecucionesMes: maxN }); }}>
      <h3 className="text-small font-semibold">Nueva rutina (se crea desactivada)</h3>
      <label htmlFor={`${id}-ag`} className="text-tiny text-ink-2">Agente</label>
      <select id={`${id}-ag`} className={sel} value={agenteId} onChange={(e) => setAgenteId(e.target.value)}>
        {agentes.map((a) => <option key={a.id} value={a.id} className="text-black">{a.nombre}</option>)}
      </select>
      <GlassInput aria-label="Nombre de la rutina" placeholder="Nombre (p. ej. Informe de los lunes)" value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={120} />
      <GlassInput aria-label="Qué debe hacer el agente" placeholder="Qué debe hacer el agente en cada ejecución" value={instruccion} onChange={(e) => setInstruccion(e.target.value)} maxLength={2000} />
      <div className="flex flex-wrap gap-2">
        <select aria-label="Tipo de tarea" className={sel} value={tipoTarea} onChange={(e) => setTipoTarea(e.target.value as TipoTarea)}>
          {(["simple", "estandar", "experta"] as const).map((t) => <option key={t} value={t} className="text-black">Tarea {NOMBRE_TIPO_TAREA[t].toLowerCase()}</option>)}
        </select>
        <select aria-label="Frecuencia" className={sel} value={frecuencia} onChange={(e) => setFrecuencia(e.target.value as (typeof FRECUENCIAS)[number])}>
          {FRECUENCIAS.map((f) => <option key={f} value={f} className="text-black">{NOMBRE_FRECUENCIA[f] ?? f}</option>)}
        </select>
        <GlassInput inputMode="numeric" aria-label="Máximo de ejecuciones al mes" aria-invalid={!(maxN >= 1)} value={max} onChange={(e) => setMax(e.target.value)} className="w-28" />
      </div>
      <div className="flex flex-wrap gap-2">
        <PillButton type="submit" solid disabled={!valida}>Crear desactivada</PillButton>
        <PillButton onClick={() => alTerminar(null)}>Cancelar</PillButton>
      </div>
    </form>
  );
}
