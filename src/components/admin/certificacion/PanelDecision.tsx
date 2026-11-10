"use client";

import { Check, Loader2, MessageSquareWarning, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { decidirSolicitud } from "@/app/admin/certificacion/acciones";
import { PillButton } from "@/components/glass";
import { CHECKLIST, NOMBRE_DECISION, type Decision, type PuntoId } from "@/lib/admin/certificacion/config";

type Marca = { ok: boolean | null; comentario: string };
const ICONO: Record<Decision, typeof Check> = { aprobar: Check, pedir_cambios: MessageSquareWarning, rechazar: X };

/**
 * Lista de comprobación de 9 puntos y decisión. El servidor vuelve a validarlo todo: aprobar exige los 9 puntos cumplidos; si no se
 * aprueba, el comentario para la empresa es obligatorio; y si hace falta segunda opinión, la solicitud no se cierra todavía.
 */
export function PanelDecision({ solicitud, esSegundaOpinion, motivosSegundaOpinion, siempreSegunda = false }: {
  solicitud: { clase: "agente" | "plantilla"; id: string }; esSegundaOpinion: boolean; motivosSegundaOpinion: string[]; siempreSegunda?: boolean;
}) {
  const router = useRouter();
  const [marcas, setMarcas] = useState<Record<PuntoId, Marca>>(() => Object.fromEntries(CHECKLIST.map((p) => [p.id, { ok: null, comentario: "" }])) as Record<PuntoId, Marca>);
  const [decision, setDecision] = useState<Decision | null>(null);
  const [comentario, setComentario] = useState("");
  const [notas, setNotas] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState<{ error: boolean; texto: string } | null>(null);

  const marcados = CHECKLIST.filter((p) => marcas[p.id].ok !== null).length;
  const cumplidos = CHECKLIST.filter((p) => marcas[p.id].ok === true).length;
  const todos = marcados === CHECKLIST.length;
  const pideSegunda = !esSegundaOpinion && (decision === "rechazar" || (decision === "aprobar" && (siempreSegunda || motivosSegundaOpinion.length > 0)));
  const problema = !todos ? `Marca los ${CHECKLIST.length} puntos (${marcados} de ${CHECKLIST.length}).`
    : !decision ? "Elige una decisión."
    : decision === "aprobar" && cumplidos < CHECKLIST.length ? "No se puede aprobar con puntos sin cumplir: pide cambios o rechaza."
    : decision !== "aprobar" && comentario.trim() === "" ? "Escribe el comentario para la empresa: es obligatorio si no apruebas." : null;

  const enviar = async () => {
    if (problema || !decision) return;
    setOcupado(true); setAviso(null);
    const r = await decidirSolicitud({
      ...solicitud, decision, comentario: comentario.trim() || undefined, notas: notas.trim() || undefined,
      checklist: CHECKLIST.map((p) => ({ id: p.id, ok: marcas[p.id].ok === true, ...(marcas[p.id].comentario.trim() ? { comentario: marcas[p.id].comentario.trim() } : {}) })),
    }).catch(() => ({ ok: false as const, mensaje: "No se pudo contactar con el servidor." }));
    setOcupado(false);
    if (!r.ok) { setAviso({ error: true, texto: r.mensaje }); return; }
    setAviso({ error: false, texto: r.segundaOpinion ? "Revisión registrada. La solicitud pasa a segunda opinión: la tiene que cerrar otra persona del equipo." : "Decisión registrada y solicitud cerrada. Se ha avisado a la empresa." });
    router.refresh();
  };

  return (
    <div className="flex flex-col gap-4">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-small text-ink-2">Lista de comprobación · {cumplidos} de {CHECKLIST.length} cumplidos</legend>
        {CHECKLIST.map((p, i) => {
          const m = marcas[p.id];
          const poner = (ok: boolean) => setMarcas((x) => ({ ...x, [p.id]: { ...x[p.id], ok } }));
          return (
            <div key={p.id} role="group" aria-labelledby={`p-${p.id}`} className="rounded-card bg-white/6 p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p id={`p-${p.id}`} className="text-small font-semibold">{i + 1}. {p.titulo}</p>
                  <p className="text-tiny text-ink-2">{p.ayuda}</p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <PillButton compact icon={Check} active={m.ok === true} onClick={() => poner(true)}>Cumple</PillButton>
                  <PillButton compact icon={X} active={m.ok === false} onClick={() => poner(false)}>No cumple</PillButton>
                </div>
              </div>
              {m.ok === false && (
                <input type="text" value={m.comentario} maxLength={500} placeholder="Qué falla (opcional)" aria-label={`Qué falla en «${p.titulo}»`}
                  onChange={(e) => setMarcas((x) => ({ ...x, [p.id]: { ...x[p.id], comentario: e.target.value } }))}
                  className="mt-2 w-full rounded-card border border-glass-border bg-black/30 px-3 py-2 text-small text-white outline-none focus-visible:outline-2 focus-visible:outline-white" />
              )}
            </div>
          );
        })}
      </fieldset>

      <div role="group" aria-label="Decisión" className="flex flex-wrap gap-2">
        {(Object.keys(NOMBRE_DECISION) as Decision[]).map((d) => (
          <PillButton key={d} icon={ICONO[d]} active={decision === d} onClick={() => setDecision(d)}>{NOMBRE_DECISION[d]}</PillButton>
        ))}
      </div>

      <label className="flex flex-col gap-1 text-small">
        <span className="text-ink-2">Comentario para la empresa {decision && decision !== "aprobar" ? "(obligatorio)" : "(opcional)"}</span>
        <textarea value={comentario} onChange={(e) => setComentario(e.target.value)} rows={3} maxLength={2000} placeholder="Lo verá la empresa en el aviso de certificación."
          className="w-full resize-y rounded-card border border-glass-border bg-black/30 p-3 text-small text-white outline-none focus-visible:outline-2 focus-visible:outline-white" />
      </label>
      <label className="flex flex-col gap-1 text-small">
        <span className="text-ink-2">Notas internas (nunca las ve la empresa)</span>
        <textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={2} maxLength={4000}
          className="w-full resize-y rounded-card border border-glass-border bg-black/30 p-3 text-small text-white outline-none focus-visible:outline-2 focus-visible:outline-white" />
      </label>

      {pideSegunda && (
        <p className="rounded-card border border-status-waiting/60 bg-black/30 p-3 text-small">
          <span className="font-semibold">Necesitará segunda opinión.</span>{" "}
          {decision === "rechazar" ? "Un rechazo lo confirma siempre otra persona." : siempreSegunda ? "Una plantilla la usarán muchas empresas: la confirma siempre otra persona." : motivosSegundaOpinion.join(" ")}
        </p>
      )}
      {esSegundaOpinion && <p className="text-small text-ink-2">Esta es la segunda opinión: si coincide con la primera, la solicitud se cierra; si no, decide un administrador.</p>}

      <div className="flex flex-wrap items-center gap-3">
        <PillButton icon={ocupado ? Loader2 : Check} active disabled={ocupado || problema !== null} onClick={enviar}>
          {ocupado ? "Guardando…" : decision ? `Confirmar: ${NOMBRE_DECISION[decision].toLowerCase()}` : "Confirmar decisión"}
        </PillButton>
        {problema && <p className="text-small text-ink-2">{problema}</p>}
      </div>
      {aviso && <p role={aviso.error ? "alert" : "status"} className={`text-small ${aviso.error ? "text-status-error" : ""}`}>{aviso.texto}</p>}
    </div>
  );
}
