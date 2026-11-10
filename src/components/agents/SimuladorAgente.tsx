"use client";

import { CheckCircle2, Loader2, PlayCircle, XCircle } from "lucide-react";
import { useState } from "react";
import { probarCasosDeAgente, simularConAgente, type CasosVista, type SimulacionVista } from "@/app/actions/agentes";
import { PillButton } from "@/components/glass";

const CANALES = [["whatsapp", "WhatsApp"], ["correo", "Correo"], ["interno", "Interno"]] as const;
type Canal = (typeof CANALES)[number][0];

/**
 * Simulador de la ficha del agente: prueba al agente con su configuración real, pero sin efectos (nada se envía ni se escribe).
 * Muestra su respuesta, las herramientas que usaría, lo que pediría aprobar, los traspasos y los créditos estimados; y puede
 * ejecutar los casos de prueba de la plantilla marcando cuáles cumplen.
 */
export function SimuladorAgente({ agentSlug }: { agentSlug: string }) {
  const [mensaje, setMensaje] = useState("");
  const [canal, setCanal] = useState<Canal>("whatsapp");
  const [ocupado, setOcupado] = useState<"simular" | "casos" | null>(null);
  const [sim, setSim] = useState<SimulacionVista | null>(null);
  const [casos, setCasos] = useState<CasosVista | null>(null);

  const simular = async () => {
    setOcupado("simular"); setSim(null);
    try { setSim(await simularConAgente({ agentSlug, mensaje, canal })); } catch { setSim({ ok: false, mensaje: "No se pudo contactar con el servidor." }); } finally { setOcupado(null); }
  };
  const probarCasos = async () => {
    setOcupado("casos"); setCasos(null);
    try { setCasos(await probarCasosDeAgente({ agentSlug })); } catch { setCasos({ ok: false, mensaje: "No se pudo contactar con el servidor." }); } finally { setOcupado(null); }
  };

  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-small">
        <span className="text-ink-2">Mensaje de prueba</span>
        <textarea value={mensaje} onChange={(e) => setMensaje(e.target.value)} maxLength={4000} rows={2} placeholder="¿Cuánto cuesta una limpieza?" className="rounded-card bg-white/8 px-3 py-2 text-small outline-none focus-visible:ring-2 focus-visible:ring-accent" />
      </label>
      <div className="flex items-center gap-2" role="group" aria-label="Canal">
        {CANALES.map(([id, nombre]) => (
          <PillButton key={id} active={canal === id} onClick={() => setCanal(id)} aria-pressed={canal === id}>{nombre}</PillButton>
        ))}
      </div>
      <PillButton icon={ocupado === "simular" ? Loader2 : PlayCircle} disabled={ocupado !== null || mensaje.trim() === ""} onClick={simular} className="w-full justify-center">
        {ocupado === "simular" ? "Simulando…" : "Simular"}
      </PillButton>
      <p className="text-tiny text-ink-3">Nada sale fuera ni se escribe en el CRM ni en la memoria. Cada empresa tiene simulaciones gratis al mes; pasada la cuota cuestan lo de una tarea simple.</p>

      {sim && !sim.ok && <p role="status" className="text-small text-ink-2">{sim.mensaje}</p>}
      {sim?.ok && (
        <div className="flex flex-col gap-2 rounded-card bg-white/6 p-3 text-small" aria-live="polite">
          {sim.resultado.mensajesAlCliente.map((m, i) => <p key={i}><span className="font-semibold">Respondería:</span> {m.texto}</p>)}
          {sim.resultado.estado !== "done" && <p className="text-ink-2">La tarea terminó como «{sim.resultado.estado}»{sim.resultado.motivo ? `: ${sim.resultado.motivo}` : ""}.</p>}
          <p className="font-semibold">Herramientas que usaría</p>
          <ul className="flex flex-col gap-1">
            {sim.resultado.herramientas.map((h, i) => <li key={i} className="text-ink-2">{h.herramienta} · {h.estado}{h.permiso ? ` (permiso: ${h.permiso})` : ""}</li>)}
            {sim.resultado.herramientas.length === 0 && <li className="text-ink-3">Ninguna.</li>}
          </ul>
          {sim.resultado.aprobaciones.length > 0 && (<>
            <p className="font-semibold">Esto pediría aprobación</p>
            <ul className="flex flex-col gap-1">{sim.resultado.aprobaciones.map((a, i) => <li key={i} className="text-ink-2">{a.nombre}: {a.vistaPrevia}</li>)}</ul>
          </>)}
          {sim.resultado.traspasos.length > 0 && (<>
            <p className="font-semibold">Traspasos que haría</p>
            <ul className="flex flex-col gap-1">{sim.resultado.traspasos.map((t, i) => <li key={i} className="text-ink-2">{t.destino} ({t.tipo ?? "—"}): {t.resumen}</li>)}</ul>
          </>)}
          {sim.resultado.avisosDeReglas.map((a, i) => <p key={i} className="text-ink-2">{a}</p>)}
          <p className="text-ink-3">
            Créditos estimados en real: {sim.resultado.creditosEstimados.total} (tarea {sim.resultado.creditosEstimados.tarea} · traspasos {sim.resultado.creditosEstimados.traspasos} · mensajes {sim.resultado.creditosEstimados.mensajes}).{" "}
            Esta simulación: {sim.resultado.simulacion.gratis ? `gratis (${sim.resultado.simulacion.cuota.restantes} gratis restantes este mes)` : `${sim.resultado.simulacion.creditosCobrados} créditos`}.
          </p>
        </div>
      )}

      <hr className="border-white/10" />
      <PillButton icon={ocupado === "casos" ? Loader2 : CheckCircle2} disabled={ocupado !== null} onClick={probarCasos} className="w-full justify-center">
        {ocupado === "casos" ? "Probando casos…" : "Probar casos de la plantilla"}
      </PillButton>
      {casos && !casos.ok && <p role="status" className="text-small text-ink-2">{casos.mensaje}</p>}
      {casos?.ok && (
        <div className="flex flex-col gap-2 text-small" aria-live="polite">
          <p className="font-semibold">{casos.resultado.cumplen} de {casos.resultado.total} casos cumplen el comportamiento esperado</p>
          <ul className="flex flex-col gap-1">
            {casos.resultado.casos.map((c) => (
              <li key={c.id} className="flex items-start gap-2 rounded-card bg-white/6 px-3 py-2">
                {c.cumple ? <CheckCircle2 aria-hidden className="mt-0.5 size-4 shrink-0" /> : <XCircle aria-hidden className="mt-0.5 size-4 shrink-0" />}
                <span><span className="font-semibold">{c.titulo}</span> · {c.cumple ? "Cumple" : "No cumple"}{!c.cumple && <span className="block text-ink-2">{c.motivo}</span>}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
