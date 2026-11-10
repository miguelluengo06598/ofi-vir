"use client";

import { Hand, Loader2, Undo2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { soltar, tomar } from "@/app/admin/certificacion/acciones";
import { PillButton } from "@/components/glass";

type Ref = { clase: "agente" | "plantilla"; id: string };
const rutaDe = (r: Ref) => (r.clase === "agente" ? `/admin/certificacion/${r.id}` : `/admin/certificacion/plantillas/${r.id}`);

/** «Coger»: la solicitud queda asignada a quien pulsa (y pasa a «en revisión»). El servidor comprueba categoría y segunda opinión. */
export function BotonTomar({ solicitud, etiqueta = "Coger", abrir = true }: { solicitud: Ref; etiqueta?: string; abrir?: boolean }) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pulsar = async () => {
    setOcupado(true); setError(null);
    const r = await tomar(solicitud).catch(() => ({ ok: false as const, mensaje: "No se pudo contactar con el servidor." }));
    setOcupado(false);
    if (!r.ok) { setError(r.mensaje); return; }
    if (abrir) router.push(rutaDe(solicitud)); else router.refresh();
  };
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <PillButton icon={ocupado ? Loader2 : Hand} compact active disabled={ocupado} onClick={pulsar}>{ocupado ? "Asignando…" : etiqueta}</PillButton>
      {error && <span role="alert" className="max-w-56 text-right text-tiny text-status-error">{error}</span>}
    </span>
  );
}

/** Devuelve la solicitud a la cola. */
export function BotonSoltar({ solicitud }: { solicitud: Ref }) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pulsar = async () => {
    setOcupado(true); setError(null);
    const r = await soltar(solicitud).catch(() => ({ ok: false as const, mensaje: "No se pudo contactar con el servidor." }));
    setOcupado(false);
    if (!r.ok) setError(r.mensaje); else router.push("/admin/certificacion");
  };
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <PillButton icon={ocupado ? Loader2 : Undo2} compact disabled={ocupado} onClick={pulsar}>Devolver a la cola</PillButton>
      {error && <span role="alert" className="text-tiny text-status-error">{error}</span>}
    </span>
  );
}
