"use client";

import { Loader2, PlayCircle } from "lucide-react";
import { useState } from "react";
import { simular, type Hecho } from "@/app/admin/certificacion/acciones";
import { PillButton } from "@/components/glass";
import type { ResultadoSimulacion } from "@/lib/agentes/simulador/servicio";

const CANALES = [["whatsapp", "WhatsApp"], ["correo", "Correo"], ["interno", "Interno"]] as const;
type Canal = (typeof CANALES)[number][0];

/** El revisor prueba sus propios casos contra la versión enviada: en la empresa ficticia de examen, sin tocar nada de la empresa real. */
export function SimuladorRevisor({ solicitudId }: { solicitudId: string }) {
  const [mensaje, setMensaje] = useState("");
  const [canal, setCanal] = useState<Canal>("whatsapp");
  const [ocupado, setOcupado] = useState(false);
  const [pruebas, setPruebas] = useState<{ mensaje: string; canal: Canal; r: Hecho<{ resultado: ResultadoSimulacion }> }[]>([]);

  const probar = async () => {
    setOcupado(true);
    const r = await simular({ id: solicitudId, mensaje, canal }).catch(() => ({ ok: false as const, mensaje: "No se pudo contactar con el servidor." }));
    setPruebas((p) => [{ mensaje, canal, r }, ...p]);
    setOcupado(false);
  };

  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-small">
        <span className="text-ink-2">Mensaje de prueba</span>
        <textarea value={mensaje} onChange={(e) => setMensaje(e.target.value)} rows={2} maxLength={4000} placeholder="Hola, ¿cuánto cuesta un implante? Necesito el precio ya."
          className="w-full resize-y rounded-card border border-glass-border bg-black/30 p-3 text-small text-white outline-none focus-visible:outline-2 focus-visible:outline-white" />
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Canal" className="flex gap-2">
          {CANALES.map(([id, nombre]) => <PillButton key={id} compact active={canal === id} onClick={() => setCanal(id)}>{nombre}</PillButton>)}
        </div>
        <PillButton icon={ocupado ? Loader2 : PlayCircle} disabled={ocupado || mensaje.trim() === ""} onClick={probar}>{ocupado ? "Simulando…" : "Simular"}</PillButton>
      </div>
      <p className="text-tiny text-ink-3">Se ejecuta sobre una copia de la versión enviada, en la empresa ficticia de examen y sin efectos. El coste de IA lo asume la plataforma.</p>
      <ul aria-live="polite" className="flex flex-col gap-2">
        {pruebas.map((p, i) => (
          <li key={pruebas.length - i} className="rounded-card bg-white/6 p-3 text-small">
            <p className="text-ink-2">{CANALES.find(([id]) => id === p.canal)?.[1]} · «{p.mensaje}»</p>
            {!p.r.ok ? <p role="alert" className="text-status-error">{p.r.mensaje}</p> : (
              <div className="mt-1 flex flex-col gap-1">
                {p.r.resultado.mensajesAlCliente.map((m, k) => <p key={k}><span className="font-semibold">Respondería:</span> {m.texto}</p>)}
                {p.r.resultado.mensajesAlCliente.length === 0 && <p><span className="font-semibold">Respuesta final:</span> {p.r.resultado.respuesta || "(vacía)"}</p>}
                {p.r.resultado.estado !== "done" && <p className="text-ink-2">Terminó como «{p.r.resultado.estado}»{p.r.resultado.motivo ? `: ${p.r.resultado.motivo}` : ""}.</p>}
                <p className="text-ink-2">Herramientas: {p.r.resultado.herramientas.map((h) => `${h.herramienta} (${h.estado}${h.permiso ? `, ${h.permiso}` : ""})`).join(" · ") || "ninguna"}</p>
                {p.r.resultado.aprobaciones.length > 0 && <p className="text-ink-2">Pediría aprobación: {p.r.resultado.aprobaciones.map((a) => a.nombre).join(", ")}</p>}
                {p.r.resultado.traspasos.length > 0 && <p className="text-ink-2">Traspasos: {p.r.resultado.traspasos.map((t) => `${t.destino} (${t.tipo ?? "—"})`).join(", ")}</p>}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
