"use client";

/**
 * «Puesta en marcha»: lo que le queda al cliente para tener su oficina funcionando, con un botón directo para cada tarea.
 * Las tareas que se comprueban solas (invitación, conexiones, conocimiento, datos fiscales) se marcan en cuanto están hechas;
 * las manuales (aprobar la configuración de un agente) las marca un propietario o administrador desde aquí.
 */
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { CircleCheck, Circle, Clock, Lock, Rocket } from "lucide-react";
import { GlassPanel, PillButton } from "@/components/glass";
import { llamar } from "@/components/oficina/llamar";
import { destinoDeAccion } from "@/lib/admin/implantacion/config";

type Tarea = {
  id: string; titulo: string; ayuda: string | null; estado: string; obligatoria: boolean; venceEn: string | null; hechaEn: string | null; atrasada: boolean;
  accion: string | null; agentId: string | null; automatica: boolean; bloqueada: boolean; esperaA: string[]; puedoMarcar: boolean;
};
type Datos = {
  implantacion: null | { estado: string; objetivoFin: string | null; completadaEn: string | null; responsable: string | null; total: number; hechas: number; progreso: number; samgple: { pendientes: number; proxima: string | null } };
  tareas?: Tarea[]; puedoGestionar?: boolean;
};
const dia = (d: string) => new Date(`${d.slice(0, 10)}T12:00:00`).toLocaleDateString("es-ES", { day: "numeric", month: "long" });
const campo = "w-full rounded-card border border-glass-border bg-black/25 px-3 py-2 text-small text-white placeholder:text-ink-3 focus-visible:outline-2 focus-visible:outline-white";

export function PuestaEnMarcha() {
  const [datos, setDatos] = useState<Datos | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const cargar = useCallback(() => {
    void llamar<Datos>("/api/puesta-en-marcha").then((r) => (r.ok ? setDatos(r.datos) : setError(r.mensaje)));
  }, []);
  useEffect(cargar, [cargar]);

  if (error) return <GlassPanel className="mx-auto w-full max-w-3xl p-6"><p role="alert" className="text-small text-status-error">{error}</p></GlassPanel>;
  if (!datos) return <p role="status" className="mx-auto text-body text-ink-2">Cargando…</p>;
  const impl = datos.implantacion;
  if (!impl) return (
    <GlassPanel as="section" className="mx-auto w-full max-w-3xl p-6">
      <h1 className="text-h1">Puesta en marcha</h1>
      <p className="mt-2 text-body text-ink-2">Tu oficina no tiene una puesta en marcha guiada. Si necesitas ayuda para configurarla, escríbenos.</p>
    </GlassPanel>
  );
  const tareas = datos.tareas ?? [];
  const pendientes = tareas.filter((t) => t.estado !== "hecha");
  const hechas = tareas.filter((t) => t.estado === "hecha");
  const fiscales = pendientes.find((t) => t.accion === "datos_fiscales");

  const marcar = async (t: Tarea) => {
    setAviso(null);
    const r = await llamar(`/api/puesta-en-marcha/${t.id}`, "POST", { hecha: true });
    setAviso(r.ok ? `Hecho: ${t.titulo}.` : r.mensaje);
    cargar();
  };

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <GlassPanel as="section" aria-labelledby="pm-t" className="flex flex-col gap-4 p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 id="pm-t" className="flex items-center gap-2 text-h1"><Rocket size={24} aria-hidden="true" />Puesta en marcha</h1>
            <p className="mt-1 text-small text-ink-2">
              {impl.estado === "completada" ? `Tu oficina está en marcha${impl.completadaEn ? ` desde el ${dia(impl.completadaEn)}` : ""}.` : "Lo que falta para que tus agentes trabajen con clientes reales."}
              {impl.responsable ? ` Tu responsable en SAMGPLE es ${impl.responsable}.` : ""}
              {impl.objetivoFin && impl.estado !== "completada" ? ` Objetivo: ${dia(impl.objetivoFin)}.` : ""}
            </p>
          </div>
          <p className="text-small text-ink-2"><span className="text-h2 text-white">{impl.progreso} %</span> · {impl.hechas} de {impl.total} pasos</p>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-white/15" role="progressbar" aria-valuenow={impl.progreso} aria-valuemin={0} aria-valuemax={100} aria-label="Progreso de la puesta en marcha">
          <div className="h-full origin-left rounded-full bg-status-working" style={{ transform: `scaleX(${impl.progreso / 100})` }} />
        </div>
        {impl.samgple.pendientes > 0 && <p className="text-small text-ink-2">SAMGPLE tiene {impl.samgple.pendientes} pasos en marcha{impl.samgple.proxima ? `; el siguiente: «${impl.samgple.proxima}»` : ""}.</p>}
        {aviso && <p role="status" className="text-small">{aviso}</p>}
      </GlassPanel>

      <GlassPanel as="section" aria-labelledby="pm-tuyas" className="flex flex-col gap-3 p-5 sm:p-6">
        <h2 id="pm-tuyas" className="text-h2">{pendientes.length ? "Lo que te toca" : "Has hecho todo lo que te tocaba"}</h2>
        {pendientes.length === 0 && <p className="text-small text-ink-2">Gracias. Te avisaremos cuando tus agentes estén certificados y activos.</p>}
        <ul className="flex flex-col gap-2">
          {pendientes.map((t) => {
            const destino = destinoDeAccion(t.accion, t);
            return (
              <li key={t.id} className="flex flex-wrap items-start justify-between gap-3 rounded-card bg-black/20 p-3 text-small">
                <span className="flex min-w-0 flex-1 gap-3">
                  {t.bloqueada ? <Lock size={17} aria-label="Esperando" className="mt-0.5 shrink-0 text-ink-3" /> : <Circle size={17} aria-label="Pendiente" className="mt-0.5 shrink-0 text-ink-2" />}
                  <span className="min-w-0">
                    <span className="block">{t.titulo}{!t.obligatoria && <span className="text-ink-3"> (opcional)</span>}</span>
                    {t.ayuda && <span className="block text-tiny text-ink-3">{t.ayuda}</span>}
                    {t.bloqueada && <span className="block text-tiny text-ink-3">Antes: {t.esperaA.join(", ")}</span>}
                    {t.venceEn && <span className={`mt-0.5 flex items-center gap-1 text-tiny ${t.atrasada ? "font-semibold text-status-error" : "text-ink-3"}`}><Clock size={12} aria-hidden="true" />{t.atrasada ? "Atrasada: era" : "Antes del"} {dia(t.venceEn)}</span>}
                    {t.automatica && <span className="block text-tiny text-ink-3">Se marcará sola en cuanto esté hecha.</span>}
                  </span>
                </span>
                <span className="flex flex-wrap gap-2">
                  {destino && !t.bloqueada && (destino.href.startsWith("#")
                    ? <a href={destino.href} className="glass glass-interactive rounded-pill px-4 py-2 text-white">{destino.texto}</a>
                    : <Link href={destino.href} className="glass glass-interactive rounded-pill px-4 py-2 text-white">{destino.texto}</Link>)}
                  {t.puedoMarcar && <PillButton onClick={() => marcar(t)}>{t.accion === "aprobar_agente" ? "Lo apruebo" : "Hecho"}</PillButton>}
                </span>
              </li>
            );
          })}
        </ul>
        {hechas.length > 0 && (
          <details className="text-small">
            <summary className="cursor-pointer text-ink-2">Hecho ({hechas.length})</summary>
            <ul className="mt-2 flex flex-col gap-1">
              {hechas.map((t) => <li key={t.id} className="flex items-center gap-2 text-ink-3"><CircleCheck size={15} aria-label="Hecho" className="text-status-working" /><span className="line-through">{t.titulo}</span></li>)}
            </ul>
          </details>
        )}
      </GlassPanel>

      {fiscales && datos.puedoGestionar && <FormularioFiscales alGuardar={cargar} />}
    </div>
  );
}

function FormularioFiscales({ alGuardar }: { alGuardar: () => void }) {
  const [f, setF] = useState({ razonSocial: "", nif: "", direccion: "", codigoPostal: "", ciudad: "", provincia: "", pais: "ES", emailFacturacion: "" });
  const [estado, setEstado] = useState<{ ok: boolean; texto: string } | null>(null);
  const [enviando, setEnviando] = useState(false);
  useEffect(() => {
    void llamar<{ datos: typeof f | null }>("/api/empresas/datos-fiscales").then((r) => { if (r.ok && r.datos.datos) setF({ ...r.datos.datos, provincia: r.datos.datos.provincia ?? "" }); });
  }, []);
  const c = (k: keyof typeof f, t: string, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className="flex flex-col gap-1 text-small text-ink-2">{t}<input className={campo} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} {...extra} /></label>
  );
  return (
    <GlassPanel as="section" id="datos-fiscales" aria-labelledby="pm-fiscales" className="flex flex-col gap-3 p-5 sm:p-6">
      <h2 id="pm-fiscales" className="text-h2">Datos fiscales</h2>
      <p className="text-small text-ink-2">Los usamos para las facturas de servicios de SAMGPLE.</p>
      <form className="flex flex-col gap-3" onSubmit={async (e) => {
        e.preventDefault(); setEnviando(true); setEstado(null);
        const r = await llamar("/api/empresas/datos-fiscales", "POST", { ...f, provincia: f.provincia || undefined });
        setEnviando(false);
        setEstado(r.ok ? { ok: true, texto: "Datos fiscales guardados." } : { ok: false, texto: r.mensaje });
        if (r.ok) alGuardar();
      }}>
        <div className="grid gap-3 sm:grid-cols-2">
          {c("razonSocial", "Razón social", { required: true, autoComplete: "organization" })}
          {c("nif", "NIF / CIF", { required: true })}
          <div className="sm:col-span-2">{c("direccion", "Dirección", { required: true, autoComplete: "street-address" })}</div>
          {c("codigoPostal", "Código postal", { required: true, autoComplete: "postal-code" })}
          {c("ciudad", "Ciudad", { required: true })}
          {c("provincia", "Provincia")}
          {c("pais", "País (código de dos letras)", { required: true, maxLength: 2 })}
          <div className="sm:col-span-2">{c("emailFacturacion", "Correo de facturación", { required: true, type: "email" })}</div>
        </div>
        <div className="flex items-center gap-3">
          <PillButton type="submit" disabled={enviando}>{enviando ? "Guardando…" : "Guardar datos fiscales"}</PillButton>
          {estado && <p role={estado.ok ? "status" : "alert"} className={`text-small ${estado.ok ? "text-status-working" : "text-status-error"}`}>{estado.texto}</p>}
        </div>
      </form>
    </GlassPanel>
  );
}
