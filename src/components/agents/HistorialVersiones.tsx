"use client";

import { BadgeCheck, ChevronDown, History, Loader2, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { historialDeAgente, volverAVersion } from "@/app/actions/ciclo";
import { PillButton } from "@/components/glass";
import type { EnvioCertificacion, VersionVista } from "@/lib/agentes/versiones/servicio";
import { textoDeEnvio } from "./textoDeEnvio";

const fecha = (iso: string) => new Date(iso).toLocaleString("es-ES", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
const dia = (iso: string) => new Date(iso).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });
const AL_VOLVER: Record<NonNullable<VersionVista["alVolver"]>, string> = {
  reactivar: "Su certificación sigue vigente: se reactiva sin pasar de nuevo por revisión.",
  certificar: "Se crea una versión igual y se envía a certificación; mientras tanto sigue la versión actual.",
  aplicar: "Se crea una versión igual y se aplica al momento.",
};

/**
 * Historial de versiones: qué cambió en cada una, cuáles fueron certificadas, cuál trabaja ahora y «Volver a esta versión»
 * (crea una versión nueva igual a la antigua; nunca reescribe el historial).
 */
export function HistorialVersiones({ agentSlug, refresco, alCambiar }: { agentSlug: string; refresco: number; alCambiar: () => void | Promise<void> }) {
  const [abierto, setAbierto] = useState(false);
  const [versiones, setVersiones] = useState<VersionVista[] | null | undefined>(undefined);
  const [ocupada, setOcupada] = useState<number | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try { setVersiones(await historialDeAgente(agentSlug)); } catch { setVersiones(null); }
  }, [agentSlug]);
  useEffect(() => {
    if (!abierto) return;
    const t = setTimeout(cargar, 0);
    return () => clearTimeout(t);
  }, [abierto, cargar, refresco]);

  const volver = async (v: VersionVista) => {
    setOcupada(v.version); setAviso(null);
    try {
      const r = await volverAVersion({ agentSlug, version: v.version });
      setAviso(!r.ok ? r.mensaje : r.reactivada ? `Has vuelto a la versión ${v.version} (ahora es la ${r.version}): ya está trabajando.` : `Versión ${r.version} creada a partir de la ${v.version}. ${textoDeEnvio(r.certificacion as EnvioCertificacion | null, r.aplicada)}`);
    } catch {
      setAviso("No se pudo contactar con el servidor.");
    } finally {
      setOcupada(null);
      await cargar();
      await alCambiar();
    }
  };

  return (
    <div className="flex flex-col gap-2 border-t border-glass-border pt-3">
      <button type="button" aria-expanded={abierto} onClick={() => setAbierto((a) => !a)}
        className="flex w-full cursor-pointer items-center gap-2 rounded-card px-1 py-1 text-left text-small font-semibold hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-white">
        <History size={14} aria-hidden="true" />
        <span className="flex-1">Historial de versiones</span>
        <ChevronDown size={14} aria-hidden="true" className={abierto ? "rotate-180" : ""} />
      </button>
      {abierto && versiones === undefined && <p className="text-small text-ink-3">Cargando…</p>}
      {abierto && versiones === null && <p className="text-small text-ink-3">No se pudo leer el historial.</p>}
      {aviso && <p role="status" className="text-small text-ink-2">{aviso}</p>}
      {abierto && versiones && (
        <ol aria-label="Versiones del agente, de la más reciente a la más antigua" className="flex flex-col gap-2">
          {versiones.map((v) => (
            <li key={v.version} className="rounded-card bg-white/6 p-3 text-small">
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="font-semibold">Versión {v.version}</span>
                {v.trabaja && <span className="rounded-pill bg-status-working/25 px-2 py-0.5 text-tiny">Trabaja ahora</span>}
                {v.esUltima && !v.trabaja && <span className="rounded-pill bg-status-waiting/25 px-2 py-0.5 text-tiny">Pendiente de certificar</span>}
                {v.certificada && (
                  <span className="inline-flex items-center gap-1 rounded-pill bg-white/12 px-2 py-0.5 text-tiny">
                    <BadgeCheck size={12} aria-hidden="true" />
                    {v.certificacionVigenteHasta ? `Certificada hasta el ${dia(v.certificacionVigenteHasta)}` : "Fue certificada (ya no vigente)"}
                  </span>
                )}
              </p>
              <p className="text-tiny text-ink-3">{fecha(v.creadaEn)}{v.autor ? ` · ${v.autor}` : ""}{v.motivo ? ` · ${v.motivo}` : ""}</p>
              {v.diferencias.length > 0 ? (
                <dl className="mt-2 flex flex-col gap-1.5">
                  {v.diferencias.map((d, i) => (
                    <div key={`${d.campo}-${i}`}>
                      <dt className="text-ink-2">{d.campo}</dt>
                      <dd className="break-words">
                        {d.antes !== null && <span className="text-ink-3 line-through">{d.antes}</span>}
                        {d.antes !== null && d.despues !== null && <span aria-hidden="true"> → </span>}
                        {d.despues !== null ? <span>{d.despues}</span> : <span className="text-ink-3"> (quitado)</span>}
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p className="mt-1 text-ink-3">{v.version === versiones.at(-1)?.version ? "Primera versión guardada." : "Sin cambios de configuración respecto a la anterior."}</p>
              )}
              {v.alVolver && (
                <div className="mt-2">
                  <PillButton icon={ocupada === v.version ? Loader2 : RotateCcw} compact disabled={ocupada !== null} onClick={() => volver(v)}>
                    {ocupada === v.version ? "Volviendo…" : "Volver a esta versión"}
                  </PillButton>
                  <p className="mt-1 text-tiny text-ink-3">{AL_VOLVER[v.alVolver]}</p>
                </div>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
