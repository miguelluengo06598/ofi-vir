"use client";

import { Archive, BadgeCheck, CircleAlert, Loader2, Pause, Play, RefreshCw, Send, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
  actualizarPlantillaDeAgente, cambiarEstadoDeAgente, cancelarCertificacionDeAgente, cicloDeAgente, enviarAgenteACertificacion,
} from "@/app/actions/ciclo";
import { PillButton } from "@/components/glass";
import type { CicloDelAgente as Ciclo, EnvioCertificacion } from "@/lib/agentes/versiones/servicio";
import { HistorialVersiones } from "./HistorialVersiones";
import { TIPO_DE_SOLICITUD as TIPO, textoDeEnvio } from "./textoDeEnvio";

const ESTADO: Record<string, { texto: string; color: string; ayuda: string }> = {
  borrador: { texto: "Borrador", color: "#9CA3AF", ayuda: "Configúralo y pruébalo en el simulador." },
  en_pruebas: { texto: "En pruebas", color: "#9CA3AF", ayuda: "Cuando esté listo, envíalo a certificación." },
  en_certificacion: { texto: "En certificación", color: "#FBBF24", ayuda: "Mientras se certifica no se puede editar." },
  rechazado: { texto: "Rechazado", color: "#F87171", ayuda: "Corrige lo indicado y vuelve a enviarlo." },
  certificado: { texto: "Certificado", color: "#34D399", ayuda: "Ya puede activarse para trabajar con datos reales." },
  activo: { texto: "Activo", color: "#34D399", ayuda: "Trabaja con su versión certificada." },
  pausado: { texto: "En pausa", color: "#9CA3AF", ayuda: "No lanza tareas nuevas; las que estaban en curso terminan." },
  suspendido: { texto: "Suspendido por IDESIE", color: "#F87171", ayuda: "IDESIE ha retirado su certificación." },
  archivado: { texto: "Archivado", color: "#9CA3AF", ayuda: "Ya no trabaja." },
};
const SOLICITUD: Record<string, string> = {
  pendiente_examen: "Examen técnico en curso", examen_suspendido: "Examen técnico no superado", pendiente_revision: "Pendiente de la revisión de IDESIE",
  en_revision: "En revisión por IDESIE", segunda_opinion: "Esperando una segunda opinión", aprobada: "Certificación aprobada", rechazada: "Certificación rechazada",
  cambios_solicitados: "El revisor ha pedido cambios", cancelada: "Solicitud cancelada",
};
const fecha = (iso: string) => new Date(iso).toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" });

/**
 * Ciclo de vida del agente en su ficha: estado, certificación, lo que falta para enviarlo, cambios pendientes, aviso de plantilla nueva
 * e historial de versiones. Todo se decide en el servidor; aquí solo se muestra y se pide.
 */
export function CicloDelAgente({ agentSlug }: { agentSlug: string }) {
  const [ciclo, setCiclo] = useState<Ciclo | null | undefined>(undefined);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [faltan, setFaltan] = useState<string[]>([]);
  const [refresco, setRefresco] = useState(0);
  // Archivar no tiene vuelta atrás: se pide confirmación en un segundo paso.
  const [confirmarArchivo, setConfirmarArchivo] = useState(false);
  const [activarAlAprobar, setActivarAlAprobar] = useState(false);

  const cargar = useCallback(async () => {
    try { setCiclo(await cicloDeAgente(agentSlug)); } catch { setCiclo(null); }
  }, [agentSlug]);
  useEffect(() => {
    const primero = setTimeout(cargar, 0);
    const t = setInterval(cargar, 15000);   // el examen y la revisión avanzan en segundo plano
    return () => { clearTimeout(primero); clearInterval(t); };
  }, [cargar]);

  const hacer = async (clave: string, accion: () => Promise<{ ok: true; [k: string]: unknown } | { ok: false; mensaje: string; faltan?: string[] }>, hecho: (r: Record<string, unknown>) => string) => {
    setOcupado(clave); setAviso(null); setFaltan([]);
    try {
      const r = await accion();
      if (r.ok) setAviso(hecho(r));
      else { setAviso(r.faltan?.length ? "Antes de enviarlo a certificación falta:" : r.mensaje); setFaltan(r.faltan ?? []); }
    } catch {
      setAviso("No se pudo contactar con el servidor.");
    } finally {
      setOcupado(null);
      await cargar();
      setRefresco((n) => n + 1);
    }
  };

  if (ciclo === undefined) return <p className="text-small text-ink-3">Cargando…</p>;
  if (ciclo === null) return <p className="text-small text-ink-3">El ciclo de certificación solo está disponible con el backend real.</p>;

  const e = ESTADO[ciclo.estado] ?? { texto: ciclo.estado, color: "#9CA3AF", ayuda: "" };
  const s = ciclo.solicitud;
  const abierta = ciclo.acciones.cancelarSolicitud;
  const pendientes = faltan.length ? faltan : ciclo.acciones.enviarACertificacion ? ciclo.faltan.map((f) => f.mensaje) : [];
  const icono = (clave: string, I: typeof Send) => (ocupado === clave ? Loader2 : I);

  return (
    <div className="flex flex-col gap-3 text-small">
      <div>
        <p className="flex items-center gap-2 font-semibold">
          <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: e.color }} />
          {e.texto}
          {ciclo.pausadoMotivo === "certificacion_caducada" && <span className="font-normal text-ink-2">· certificación caducada</span>}
        </p>
        <p className="text-ink-2">{e.ayuda}</p>
        <p className="text-tiny text-ink-3">
          {ciclo.versionCertificada !== null
            ? `Trabaja la versión ${ciclo.versionCertificada}${ciclo.certificadoHasta ? ` · certificada hasta el ${fecha(ciclo.certificadoHasta)}` : ""}`
            : `Versión ${ciclo.versionActual} · sin certificar`}
          {ciclo.cambiosPendientes ? ` · la versión ${ciclo.versionActual} espera certificación` : ""}
        </p>
      </div>

      {s && (abierta || ["examen_suspendido", "rechazada", "cambios_solicitados"].includes(s.estado)) && (
        <div className="rounded-card bg-white/6 p-3" aria-live="polite">
          <p className="font-semibold">{SOLICITUD[s.estado] ?? s.estado}</p>
          <p className="text-ink-2">{TIPO[s.tipo] ?? s.tipo} · versión {s.version}{s.via === "rapida_plantilla" ? " · vía rápida de plantilla" : ""}</p>
          {s.motivos.length > 0 && <ul className="mt-1 list-disc pl-4 text-ink-2">{s.motivos.slice(0, 6).map((m) => <li key={m}>{m}</li>)}</ul>}
          {s.comentario && <p className="mt-1"><span className="text-ink-3">Comentario del revisor: </span>{s.comentario}</p>}
        </div>
      )}

      {ciclo.plantillaNueva && (
        <div className="rounded-card border border-accent/50 bg-accent/15 p-3">
          <p className="flex items-center gap-2 font-semibold"><RefreshCw size={14} aria-hidden="true" />Hay una versión nueva de la plantilla (v{ciclo.plantillaNueva.versionNueva})</p>
          {ciclo.plantillaNueva.novedades && <p className="text-ink-2">{ciclo.plantillaNueva.novedades}</p>}
          {ciclo.plantillaNueva.cambios.length > 0 && <ul className="mt-1 list-disc pl-4 text-ink-2">{ciclo.plantillaNueva.cambios.map((c) => <li key={c}>{c}</li>)}</ul>}
          <p className="mt-1 text-tiny text-ink-3">Tu agente no cambia solo: al actualizar se crea una versión nueva que pasa por la vía rápida de certificación.</p>
          <PillButton icon={icono("plantilla", RefreshCw)} disabled={ocupado !== null || abierta} className="mt-2 w-full justify-center"
            onClick={() => hacer("plantilla", () => actualizarPlantillaDeAgente(agentSlug), (r) => textoDeEnvio(r.certificacion as EnvioCertificacion | null, r.aplicada as boolean))}>
            {ocupado === "plantilla" ? "Actualizando…" : "Actualizar a la plantilla nueva"}
          </PillButton>
        </div>
      )}

      {aviso && <p role="status" className="text-ink-2">{aviso}</p>}
      {pendientes.length > 0 && (
        <div>
          {!faltan.length && <p className="flex items-center gap-2 text-ink-2"><CircleAlert size={14} aria-hidden="true" />Para enviarlo a certificación falta:</p>}
          <ul className="mt-1 list-disc pl-4 text-ink-2">{pendientes.map((f) => <li key={f}>{f}</li>)}</ul>
        </div>
      )}

      {ciclo.acciones.enviarACertificacion && ciclo.versionCertificada === null && (
        <label className="flex cursor-pointer items-center gap-2 text-ink-2">
          <input type="checkbox" checked={activarAlAprobar} onChange={(ev) => setActivarAlAprobar(ev.target.checked)} className="size-4 accent-[#4F8CFF]" />
          Activarlo en cuanto quede certificado
        </label>
      )}
      <div className="flex flex-wrap gap-2">
        {ciclo.acciones.enviarACertificacion && (
          <PillButton icon={icono("enviar", Send)} active disabled={ocupado !== null}
            onClick={() => hacer("enviar", () => enviarAgenteACertificacion(agentSlug, { activarAlAprobar }), (r) => `Enviado a certificación: ${(TIPO[r.tipo as string] ?? "").toLowerCase()}. El examen técnico ya está en marcha.`)}>
            {ocupado === "enviar" ? "Enviando…" : ciclo.cambiosPendientes ? "Enviar cambios a certificación" : "Enviar a certificación"}
          </PillButton>
        )}
        {ciclo.acciones.activar && (
          <PillButton icon={icono("activar", ciclo.estado === "pausado" ? Play : BadgeCheck)} active disabled={ocupado !== null}
            onClick={() => hacer("activar", () => cambiarEstadoDeAgente({ agentSlug, accion: "activar" }), () => "Agente activo: ya puede trabajar con datos reales.")}>
            {ciclo.estado === "pausado" ? "Reanudar" : "Activar"}
          </PillButton>
        )}
        {ciclo.acciones.pausar && (
          <PillButton icon={icono("pausar", Pause)} disabled={ocupado !== null}
            onClick={() => hacer("pausar", () => cambiarEstadoDeAgente({ agentSlug, accion: "pausar" }), () => "Agente en pausa: no lanzará tareas nuevas; las que estaban en curso terminan.")}>
            Pausar
          </PillButton>
        )}
        {ciclo.acciones.cancelarSolicitud && (
          <PillButton icon={icono("cancelar", X)} disabled={ocupado !== null}
            onClick={() => hacer("cancelar", () => cancelarCertificacionDeAgente(agentSlug), () => "Solicitud de certificación cancelada.")}>
            Cancelar la solicitud
          </PillButton>
        )}
        {!["archivado", "en_certificacion", "suspendido"].includes(ciclo.estado) && !confirmarArchivo && (
          <PillButton icon={Archive} disabled={ocupado !== null} onClick={() => setConfirmarArchivo(true)}>Archivar</PillButton>
        )}
      </div>
      {confirmarArchivo && (
        <div role="group" aria-label="Confirmar archivo" className="flex flex-col gap-2 rounded-card border border-status-error/60 bg-black/30 p-3">
          <p>¿Archivar este agente? Dejará de trabajar y <strong>no se puede deshacer</strong>.</p>
          <div className="flex flex-wrap gap-2">
            <PillButton icon={icono("archivar", Archive)} disabled={ocupado !== null}
              onClick={() => { setConfirmarArchivo(false); void hacer("archivar", () => cambiarEstadoDeAgente({ agentSlug, accion: "archivar" }), () => "Agente archivado."); }}>
              Sí, archivar
            </PillButton>
            <PillButton disabled={ocupado !== null} onClick={() => setConfirmarArchivo(false)}>Cancelar</PillButton>
          </div>
        </div>
      )}

      <HistorialVersiones agentSlug={agentSlug} refresco={refresco} alCambiar={cargar} />
    </div>
  );
}
