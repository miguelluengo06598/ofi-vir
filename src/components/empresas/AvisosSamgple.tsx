"use client";

/**
 * Lo que MyOfia deja preparado para la empresa:
 *  - CambioPropietarioPendiente (Miembros): el propietario actual confirma o rechaza el cambio que pidió MyOfia.
 *  - ExportacionesEmpresa (Cuenta): descargar la exportación de datos (propietario o administrador).
 * Si la persona no tiene permiso, el servidor responde 403 y aquí no se muestra nada.
 */
import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { GlassPanel, PillButton } from "@/components/glass";
import { llamar } from "@/components/oficina/llamar";

type Cambio = { id: string; actual: string; nuevo: string; motivo: string; caducaEn: string; puedoDecidir: boolean };
const dia = (iso: string) => new Date(iso).toLocaleDateString("es-ES", { day: "numeric", month: "long" });

export function CambioPropietarioPendiente() {
  const [cambio, setCambio] = useState<Cambio | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  useEffect(() => { void llamar<{ cambio: Cambio | null }>("/api/empresas/propietario/cambios").then((r) => r.ok && setCambio(r.datos.cambio)); }, []);
  if (!cambio && !mensaje) return null;
  const decidir = async (decision: "confirmar" | "rechazar") => {
    if (!cambio) return;
    setEnviando(true);
    const r = await llamar<{ estado: string }>(`/api/empresas/propietario/cambios/${cambio.id}`, "POST", { decision });
    setEnviando(false);
    if (!r.ok) { setMensaje(r.mensaje); return; }
    setCambio(null);
    setMensaje(r.datos.estado === "confirmado" ? "Cambio confirmado: la nueva persona ya es la propietaria y tú pasas a administrador." : r.datos.estado === "rechazado" ? "Has rechazado el cambio de propietario." : "La petición caducó.");
  };
  return (
    <GlassPanel as="section" aria-labelledby="cambio-propietario" className="mx-auto mb-4 flex w-full max-w-4xl flex-col gap-3 p-5">
      <h2 id="cambio-propietario" className="text-h2">Cambio de propietario pendiente</h2>
      {cambio && (
        <>
          <p className="text-body">MyOfia ha pedido transferir la propiedad de <strong>{cambio.actual}</strong> a <strong>{cambio.nuevo}</strong>. Motivo: {cambio.motivo}</p>
          <p className="text-small text-ink-2">{cambio.puedoDecidir ? `Solo tú, como propietario actual, puedes confirmarlo. Caduca el ${dia(cambio.caducaEn)}.` : "Solo el propietario actual puede confirmarlo o rechazarlo."}</p>
          {cambio.puedoDecidir && (
            <div className="flex flex-wrap gap-2">
              <PillButton active aria-pressed={undefined} disabled={enviando} onClick={() => decidir("confirmar")}>Confirmar el cambio</PillButton>
              <PillButton disabled={enviando} onClick={() => decidir("rechazar")}>Rechazar</PillButton>
            </div>
          )}
        </>
      )}
      {mensaje && <p role="status" className="text-small">{mensaje}</p>}
    </GlassPanel>
  );
}

type Exportacion = { id: string; estado: string; tamanoBytes: number | null; creadaEn: string; caducaEn: string | null; descargadaEn: string | null };
const ESTADO: Record<string, string> = { procesando: "Preparándose…", lista: "Lista para descargar", error: "No se pudo generar", caducada: "Caducada" };

export function ExportacionesEmpresa() {
  const [lista, setLista] = useState<Exportacion[] | null>(null);
  useEffect(() => { void llamar<{ exportaciones: Exportacion[] }>("/api/empresas/exportaciones").then((r) => r.ok && setLista(r.datos.exportaciones)); }, []);
  if (!lista || lista.length === 0) return null;
  return (
    <GlassPanel as="section" aria-labelledby="exportaciones" className="mx-auto mt-4 flex w-full max-w-2xl flex-col gap-3 p-6">
      <h2 id="exportaciones" className="text-h2">Exportaciones de datos</h2>
      <p className="text-small text-ink-2">Archivos con los datos de tu empresa que ha preparado MyOfia a petición vuestra. Cada uno se puede descargar durante 7 días.</p>
      <ul className="flex flex-col gap-2">
        {lista.map((e) => (
          <li key={e.id} className="flex flex-wrap items-center justify-between gap-3 rounded-card bg-white/6 p-3 text-small">
            <span>{dia(e.creadaEn)} · {ESTADO[e.estado] ?? e.estado}{e.estado === "lista" && e.caducaEn ? ` (hasta el ${dia(e.caducaEn)})` : ""}</span>
            {e.estado === "lista" && <a href={`/api/empresas/exportaciones/${e.id}`} className="glass glass-interactive inline-flex items-center gap-2 rounded-pill px-4 py-2 text-white"><Download size={16} aria-hidden="true" />Descargar</a>}
          </li>
        ))}
      </ul>
    </GlassPanel>
  );
}
