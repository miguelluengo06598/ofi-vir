"use client";

import { BookmarkPlus, Check, Loader2, Sparkles } from "lucide-react";
import { useId, useState } from "react";
import { guardarCorreccionDeAgente, proponerCorreccion } from "@/app/actions/ciclo";
import { PillButton } from "@/components/glass";

const MAX = 200;

/**
 * «Recordar para la próxima»: cuando alguien edita la respuesta de un agente, Claude Haiku resume la diferencia en una regla corta que
 * la persona puede retocar antes de guardar. En un agente que ya trabaja, la regla pasa el examen técnico antes de entrar en sus
 * instrucciones. Se ofrece solo si el texto corregido es distinto del original.
 */
export function RecordarCorreccion({ agentSlug, agentName, contexto, original, corregida }: { agentSlug: string; agentName: string; contexto: string; original: string; corregida: string }) {
  const [paso, setPaso] = useState<"oferta" | "proponiendo" | "editando" | "guardando" | "hecho">("oferta");
  const [regla, setRegla] = useState("");
  const [mensaje, setMensaje] = useState<string | null>(null);
  const id = useId();
  if (original.trim() === corregida.trim()) return null;

  const proponer = async () => {
    setPaso("proponiendo"); setMensaje(null);
    try {
      const r = await proponerCorreccion({ agentSlug, contexto, original, corregida });
      if (r.ok) setRegla(r.regla); else setMensaje(`${r.mensaje} Puedes escribir la regla tú.`);
    } catch {
      setMensaje("No se pudo contactar con el servidor. Puedes escribir la regla tú.");
    }
    setPaso("editando");
  };
  const guardar = async () => {
    setPaso("guardando"); setMensaje(null);
    try {
      const r = await guardarCorreccionDeAgente({ agentSlug, contexto, original, corregida, regla });
      if (!r.ok) { setMensaje(r.mensaje); setPaso("editando"); return; }
      setMensaje(r.activa
        ? `Guardado: ${agentName} lo tendrá en cuenta desde ahora.`
        : r.certificacion?.enviada
          ? `Guardado. ${agentName} lo aplicará cuando la regla pase el examen técnico automático.`
          : `Regla guardada, pero aún no se ha enviado al examen técnico: ${r.certificacion && !r.certificacion.enviada ? r.certificacion.motivo : "inténtalo desde la ficha del agente."}`);
      setPaso("hecho");
    } catch {
      setMensaje("No se pudo contactar con el servidor."); setPaso("editando");
    }
  };

  return (
    <div className="flex flex-col gap-2 rounded-card bg-black/25 p-3 text-small" aria-live="polite">
      {paso === "oferta" && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-ink-2">Has cambiado la respuesta de {agentName}. ¿Quieres que lo recuerde?</p>
          <PillButton icon={BookmarkPlus} compact onClick={proponer}>Recordar para la próxima</PillButton>
        </div>
      )}
      {paso === "proponiendo" && <p className="flex items-center gap-2 text-ink-2"><Loader2 size={14} aria-hidden="true" className="animate-spin" />Resumiendo tu corrección en una regla…</p>}
      {(paso === "editando" || paso === "guardando") && (
        <>
          <label htmlFor={id} className="flex items-center gap-2 text-ink-2"><Sparkles size={14} aria-hidden="true" />Regla que aprenderá {agentName} (puedes editarla)</label>
          <textarea id={id} value={regla} onChange={(e) => setRegla(e.target.value.slice(0, MAX))} rows={2} maxLength={MAX} placeholder="No tutear a pacientes mayores"
            className="w-full resize-y rounded-card border border-glass-border bg-black/30 p-2 text-small text-white outline-none focus-visible:outline-2 focus-visible:outline-white" />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-tiny text-ink-3">{regla.length}/{MAX} · máximo 30 reglas por agente</span>
            <div className="flex gap-2">
              <PillButton compact disabled={paso === "guardando"} onClick={() => setPaso("oferta")}>Ahora no</PillButton>
              <PillButton icon={paso === "guardando" ? Loader2 : Check} compact active disabled={paso === "guardando" || regla.trim().length < 3} onClick={guardar}>
                {paso === "guardando" ? "Guardando…" : "Guardar regla"}
              </PillButton>
            </div>
          </div>
        </>
      )}
      {mensaje && <p role="status" className={paso === "hecho" ? "" : "text-ink-2"}>{mensaje}</p>}
    </div>
  );
}
