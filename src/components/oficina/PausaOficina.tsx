"use client";

import { Pause, Play } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { PillButton } from "@/components/glass";
import { Aviso, Seccion } from "@/components/creditos/partes";
import { fmtNumber } from "@/lib/format";
import { llamar } from "./llamar";

type Estado = { pausada: boolean; pausadaEn: string | null; eventosPorMinuto: number; eventosEsperando: number };

/**
 * «Pausar oficina»: ninguna tarea nueva empieza (las que están en marcha terminan). Lo que llega de fuera se guarda y, al reanudar,
 * la empresa elige procesarlo o descartarlo. La comprobación la hace el servidor antes de cada tarea.
 */
export function PausaOficina() {
  const [estado, setEstado] = useState<Estado | null>(null);
  const [msg, setMsg] = useState<{ tono: "ok" | "error"; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const aplicar = useCallback((r: Awaited<ReturnType<typeof llamar<Estado>>>) => {
    if (r.ok) setEstado(r.datos);
    else setMsg({ tono: "error", texto: r.mensaje });
  }, []);
  useEffect(() => { void llamar<Estado>("/api/oficina/pausa").then(aplicar); }, [aplicar]);

  async function cambiar(cuerpo: Record<string, unknown>, ok: string) {
    setOcupado(true);
    setMsg(null);
    const r = await llamar("/api/oficina/pausa", "POST", cuerpo);
    setOcupado(false);
    if (!r.ok) return setMsg({ tono: "error", texto: r.mensaje });
    setMsg({ tono: "ok", texto: ok });
    aplicar(await llamar<Estado>("/api/oficina/pausa"));
  }

  if (!estado) return msg ? <Aviso tono="error">{msg.texto}</Aviso> : null;
  return (
    <Seccion id="pausa-oficina" titulo="Estado de los agentes" acciones={
      <p className="text-small"><span className={`mr-2 inline-block size-2 rounded-full ${estado.pausada ? "bg-status-paused" : "bg-status-working"}`} aria-hidden="true" />{estado.pausada ? "Oficina pausada" : "Oficina en marcha"}</p>
    }>
      {estado.pausada ? (
        <>
          <p className="text-small text-ink-2">
            Ningún agente empieza tareas nuevas. Lo que llega de fuera se guarda: {fmtNumber(estado.eventosEsperando)} {estado.eventosEsperando === 1 ? "evento espera" : "eventos esperan"}.
            Al reanudar, elige qué hacer con ellos.
          </p>
          <div className="flex flex-wrap gap-2">
            <PillButton icon={Play} solid disabled={ocupado} onClick={() => void cambiar({ pausar: false, pendientes: "procesar" }, "Oficina reanudada: los agentes atienden lo que llegó.")}>Reanudar y atender lo que llegó</PillButton>
            <PillButton disabled={ocupado} onClick={() => void cambiar({ pausar: false, pendientes: "descartar" }, "Oficina reanudada. Lo que llegó durante la pausa se ha descartado (queda registrado).")}>Reanudar y descartarlo</PillButton>
          </div>
        </>
      ) : (
        <>
          <p className="text-small text-ink-2">
            Los agentes solo trabajan cuando hay un motivo: algo que llega de fuera, una orden vuestra, una rutina que habéis activado o un seguimiento aprobado.
            Si pausas la oficina, no empieza ninguna tarea nueva hasta que la reanudes. Límite: {fmtNumber(estado.eventosPorMinuto)} eventos por minuto (el resto espera en cola).
          </p>
          <div><PillButton icon={Pause} disabled={ocupado} onClick={() => void cambiar({ pausar: true }, "Oficina pausada. Lo que llegue se guardará.")}>Pausar oficina</PillButton></div>
        </>
      )}
      {msg && <Aviso tono={msg.tono}>{msg.texto}</Aviso>}
    </Seccion>
  );
}
