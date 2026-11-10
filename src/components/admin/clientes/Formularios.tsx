"use client";

/** Formularios de la ficha de un cliente: ficha interna, notas, datos fiscales y miembros (reenviar invitación, propietario). */
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Crown, Send } from "lucide-react";
import { PillButton } from "@/components/glass";
import { anotar, guardarFicha, guardarFiscales, pedirCambioPropietario, reenviarInvitacion, resolverCambioPropietario } from "@/app/(admin)/admin/clientes/acciones";
import { SERVICIOS, type ServicioId } from "@/lib/admin/clientes/config";
import type { DatosFiscales } from "@/lib/admin/clientes/ficha";
import { campo, Dialogo, etiqueta } from "./Dialogo";

function useEnvio() {
  const router = useRouter();
  const [enviando, iniciar] = useTransition();
  const [estado, setEstado] = useState<{ ok: boolean; texto: string } | null>(null);
  const enviar = (fn: () => Promise<{ ok: true } | { ok: false; mensaje: string }>, textoOk: string, alTerminar?: () => void) => iniciar(async () => {
    setEstado(null);
    const r = await fn();
    if (r.ok) { setEstado({ ok: true, texto: textoOk }); alTerminar?.(); router.refresh(); } else setEstado({ ok: false, texto: r.mensaje });
  });
  const aviso = estado && <p role={estado.ok ? "status" : "alert"} className={`text-small ${estado.ok ? "text-status-working" : "text-status-error"}`}>{estado.texto}</p>;
  return { enviando, enviar, aviso };
}

// ── Ficha interna ───────────────────────────────────────────────────────────────────────────────
export function FichaInterna({ companyId, responsable, servicios, equipo, editable }: { companyId: string; responsable: string | null; servicios: string[]; equipo: { id: string; nombre: string }[]; editable: boolean }) {
  const [resp, setResp] = useState(responsable ?? "");
  const [serv, setServ] = useState<Set<string>>(new Set(servicios));
  const { enviando, enviar, aviso } = useEnvio();
  return (
    <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); enviar(() => guardarFicha({ companyId, responsable: resp || null, servicios: [...serv] as ServicioId[] }), "Ficha guardada."); }}>
      <label className={etiqueta}>Responsable de SAMGPLE
        <select className={campo} value={resp} onChange={(e) => setResp(e.target.value)} disabled={!editable}>
          <option value="" className="text-black">Sin responsable</option>
          {equipo.map((p) => <option key={p.id} value={p.id} className="text-black">{p.nombre}</option>)}
        </select>
      </label>
      <fieldset className="flex flex-col gap-2" disabled={!editable}>
        <legend className="mb-1 text-small text-ink-2">Servicios contratados</legend>
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          {SERVICIOS.map((s) => (
            <label key={s.id} className="flex items-center gap-2 text-small">
              <input type="checkbox" checked={serv.has(s.id)} onChange={(e) => { const n = new Set(serv); if (e.target.checked) n.add(s.id); else n.delete(s.id); setServ(n); }} /> {s.nombre}
            </label>
          ))}
        </div>
      </fieldset>
      {editable && <div className="flex items-center gap-3"><PillButton type="submit" disabled={enviando}>{enviando ? "Guardando…" : "Guardar ficha"}</PillButton>{aviso}</div>}
    </form>
  );
}

export function NuevaNota({ companyId }: { companyId: string }) {
  const [texto, setTexto] = useState("");
  const { enviando, enviar, aviso } = useEnvio();
  return (
    <form className="flex flex-col gap-2" onSubmit={(e) => { e.preventDefault(); enviar(() => anotar({ companyId, texto }), "Nota añadida.", () => setTexto("")); }}>
      <label className={etiqueta}>Nueva nota interna (solo la ve SAMGPLE; no se puede editar ni borrar)
        <textarea className={`${campo} min-h-20`} value={texto} onChange={(e) => setTexto(e.target.value)} maxLength={4000} />
      </label>
      <div className="flex items-center gap-3"><PillButton type="submit" disabled={enviando || !texto.trim()}>{enviando ? "Guardando…" : "Añadir nota"}</PillButton>{aviso}</div>
    </form>
  );
}

// ── Datos fiscales ──────────────────────────────────────────────────────────────────────────────
export function FormularioFiscales({ companyId, datos, editable }: { companyId: string; datos: DatosFiscales | null; editable: boolean }) {
  const [f, setF] = useState({
    razonSocial: datos?.razonSocial ?? "", nif: datos?.nif ?? "", direccion: datos?.direccion ?? "", codigoPostal: datos?.codigoPostal ?? "",
    ciudad: datos?.ciudad ?? "", provincia: datos?.provincia ?? "", pais: datos?.pais ?? "ES", emailFacturacion: datos?.emailFacturacion ?? "",
  });
  const [abierto, setAbierto] = useState(false);
  const c = (k: keyof typeof f, t: string, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className={etiqueta}>{t}<input className={campo} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} disabled={!editable} {...extra} /></label>
  );
  return (
    <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); setAbierto(true); }}>
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
      {editable && <div><PillButton type="submit">Guardar datos fiscales</PillButton></div>}
      <Dialogo abierto={abierto} onCerrar={() => setAbierto(false)} titulo="Guardar datos fiscales" etiquetaConfirmar="Guardar"
        explicacion={<p>Se usarán en las facturas de servicios. El cambio (antes y después) queda en el registro de auditoría.</p>}
        onConfirmar={(motivo) => guardarFiscales({ companyId, ...f, motivo })} />
    </form>
  );
}

// ── Miembros ────────────────────────────────────────────────────────────────────────────────────
export function ReenviarInvitacion({ companyId, invitacionId, email }: { companyId: string; invitacionId: string; email: string }) {
  const [abierto, setAbierto] = useState(false);
  const [enlace, setEnlace] = useState<string | null>(null);
  return (
    <>
      <PillButton icon={Send} compact onClick={() => { setEnlace(null); setAbierto(true); }}>Reenviar</PillButton>
      <Dialogo abierto={abierto} onCerrar={() => setAbierto(false)} titulo="Reenviar invitación" etiquetaConfirmar="Reenviar" pedirMotivo={!enlace} listo={!enlace}
        explicacion={enlace ? (
          <>
            <p>No se pudo enviar el correo (falta configurar Resend o falló el envío). Copia este enlace y entrégaselo a la persona; <strong>no se volverá a mostrar</strong>:</p>
            <p className="rounded-card bg-black/30 p-3 font-mono text-tiny break-all text-white">{enlace}</p>
          </>
        ) : <p>Se anula la invitación anterior a <strong>{email}</strong> y se crea otra con el mismo rol, válida 7 días.</p>}
        onConfirmar={async (motivo) => {
          const r = await reenviarInvitacion({ companyId, invitacionId, motivo });
          if (r.ok && r.enlace) setEnlace(r.enlace);
          return r;
        }}
        alTerminar={(r) => !("enlace" in r && r.enlace)} />
    </>
  );
}

export function CambiarPropietario({ companyId, candidatos, esAdminSamgple }: { companyId: string; candidatos: { id: string; nombre: string }[]; esAdminSamgple: boolean }) {
  const [abierto, setAbierto] = useState(false);
  const [nuevo, setNuevo] = useState("");
  const [ahora, setAhora] = useState(false);
  return (
    <>
      <PillButton icon={Crown} onClick={() => { setNuevo(""); setAhora(false); setAbierto(true); }} disabled={candidatos.length === 0}>Cambiar propietario</PillButton>
      <Dialogo abierto={abierto} onCerrar={() => setAbierto(false)} titulo="Cambiar el propietario" etiquetaConfirmar={ahora ? "Cambiar propietario ahora" : "Pedir confirmación"} listo={!!nuevo}
        explicacion={<p>El propietario actual pasará a administrador. El cambio debe confirmarlo <strong>el propietario actual</strong> (le llega un aviso en Miembros, caduca en 7 días) o <strong>un admin_samgple</strong>.</p>}
        onConfirmar={(motivo) => pedirCambioPropietario({ companyId, nuevoUserId: nuevo, motivo, confirmarAhora: ahora })}>
        <label className={etiqueta}>Nueva persona propietaria (miembro activo)
          <select className={campo} value={nuevo} onChange={(e) => setNuevo(e.target.value)}>
            <option value="" className="text-black">Elige…</option>
            {candidatos.map((c) => <option key={c.id} value={c.id} className="text-black">{c.nombre}</option>)}
          </select>
        </label>
        {esAdminSamgple && (
          <label className="flex items-start gap-2 text-small">
            <input type="checkbox" checked={ahora} onChange={(e) => setAhora(e.target.checked)} className="mt-1" />
            Confirmo como admin_samgple que el cambio está autorizado y quiero aplicarlo ya (sin esperar al propietario).
          </label>
        )}
      </Dialogo>
    </>
  );
}

export function ResolverCambio({ cambioId }: { cambioId: string }) {
  const [abierto, setAbierto] = useState<null | boolean>(null);
  return (
    <div className="flex gap-2">
      <PillButton compact onClick={() => setAbierto(true)}>Confirmar</PillButton>
      <PillButton compact onClick={() => setAbierto(false)}>Rechazar</PillButton>
      <Dialogo abierto={abierto !== null} onCerrar={() => setAbierto(null)} titulo={abierto ? "Confirmar el cambio de propietario" : "Rechazar el cambio de propietario"}
        etiquetaConfirmar={abierto ? "Confirmar cambio" : "Rechazar"} peligro={!!abierto}
        explicacion={<p>{abierto ? "Confirmas como admin_samgple que el cambio está autorizado. Se aplica en el acto." : "El cambio queda rechazado y no se aplica."}</p>}
        onConfirmar={(motivo) => resolverCambioPropietario({ cambioId, aceptar: !!abierto, motivo })} />
    </div>
  );
}
