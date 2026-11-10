"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, BadgeCheck, Building2, CircleCheck, CirclePlay, CircleX, Coins, Pause, Play, Radio, Search } from "lucide-react";
import { useEffect, useMemo, useState, useTransition } from "react";
import { GlassPanel, PillButton } from "@/components/glass";
import { useMovimientoReducido } from "@/components/marketing/preferencias";
import type { Suceso, TipoSuceso } from "@/lib/admin/oficina/panorama";

const FILTROS: { id: "todo" | "tareas" | TipoSuceso; label: string }[] = [
  { id: "todo", label: "Todo" },
  { id: "tareas", label: "Tareas" },
  { id: "traspaso", label: "Traspasos" },
  { id: "compra", label: "Compras" },
  { id: "alta", label: "Altas" },
  { id: "certificacion", label: "Certificaciones" },
];

const ESTADO_TAREA: Record<string, string> = { done: "terminada", failed: "con error", review: "en revisión", approval: "esperando aprobación", scheduled: "aplazada", running: "en curso", expert: "con el experto" };
const hora = (iso: string) => new Date(iso).toLocaleString("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const eur = (c: unknown) => `${(Number(c) / 100).toLocaleString("es-ES")} €`;

/** Frase de un suceso: solo metadatos (empresa, agente, tipo, estado, importe). Nunca contenido. */
function describir(s: Suceso): { icono: typeof Radio; texto: React.ReactNode; tono?: string } {
  const quien = s.agente ? <span className="font-semibold text-white">{s.agente}</span> : "Un agente";
  switch (s.tipo) {
    case "tarea_empieza":
      return { icono: CirclePlay, texto: <>{quien} empieza una tarea</> };
    case "tarea_termina": {
      const estado = String(s.detalle.estado ?? "");
      return { icono: estado === "failed" ? CircleX : CircleCheck, tono: estado === "failed" ? "text-status-error" : undefined, texto: <>{quien}: tarea {ESTADO_TAREA[estado] ?? estado}</> };
    }
    case "traspaso":
      return { icono: ArrowRight, texto: <>{quien} pasa trabajo a <span className="font-semibold text-white">{s.agenteDestino ?? "otro agente"}</span></> };
    case "compra":
      return { icono: Coins, texto: <>Compra del pack {String(s.detalle.pack ?? "")} · {eur(s.detalle.importe_centimos)}{s.detalle.estado !== "pagada" ? ` (${String(s.detalle.estado)})` : ""}</> };
    case "alta":
      return { icono: Building2, texto: <>Nueva empresa en la plataforma</> };
    case "certificacion":
      return { icono: BadgeCheck, tono: "text-status-working", texto: <>{quien} certificado (versión {String(s.detalle.version ?? "")})</> };
  }
}

/**
 * En directo de toda la plataforma. Se actualiza cada 10 s mientras la pestaña está visible y no está en
 * pausa. Filtros por tipo y por empresa. La región no anuncia cada suceso (sería ruido): hay un resumen.
 */
export function EnDirectoPlataforma({ iniciales, cargar }: { iniciales: Suceso[]; cargar: () => Promise<{ ok: true; sucesos: Suceso[] } | { ok: false }> }) {
  const [sucesos, setSucesos] = useState(iniciales);
  const [pausa, setPausa] = useState(false);
  const [filtro, setFiltro] = useState<(typeof FILTROS)[number]["id"]>("todo");
  const [empresa, setEmpresa] = useState("");
  const [error, setError] = useState(false);
  const [, empezar] = useTransition();
  const reducido = useMovimientoReducido();

  useEffect(() => {
    if (pausa) return;
    const t = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      empezar(async () => {
        const r = await cargar();
        if (r.ok) {
          setSucesos(r.sucesos);
          setError(false);
        } else setError(true);
      });
    }, 10_000);
    return () => clearInterval(t);
  }, [pausa, cargar]);

  const visibles = useMemo(() => {
    const q = empresa.trim().toLocaleLowerCase("es");
    return sucesos.filter((s) => {
      if (filtro === "tareas" ? !s.tipo.startsWith("tarea_") : filtro !== "todo" && s.tipo !== filtro) return false;
      return !q || s.empresa.toLocaleLowerCase("es").includes(q);
    });
  }, [sucesos, filtro, empresa]);

  return (
    <GlassPanel as="section" aria-labelledby="directo-t" className="flex flex-col gap-3 p-4 sm:p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 id="directo-t" className="flex items-center gap-2 text-h2">
          <Radio size={18} aria-hidden="true" className={pausa ? "text-ink-3" : "text-status-working"} /> En directo
        </h2>
        <PillButton icon={pausa ? Play : Pause} onClick={() => setPausa((p) => !p)} compact>
          {pausa ? "Reanudar" : "Pausar"}
        </PillButton>
      </div>
      <div role="group" aria-label="Filtrar sucesos" className="flex flex-wrap gap-1.5">
        {FILTROS.map((f) => (
          <PillButton key={f.id} active={filtro === f.id} onClick={() => setFiltro(f.id)} compact>{f.label}</PillButton>
        ))}
      </div>
      <label className="flex items-center gap-2 rounded-pill bg-white/10 px-3 py-2 text-small ring-1 ring-white/15 focus-within:outline-2 focus-within:outline-white">
        <Search size={15} aria-hidden="true" className="text-ink-2" />
        <span className="sr-only">Filtrar por empresa</span>
        <input value={empresa} onChange={(e) => setEmpresa(e.target.value)} placeholder="Filtrar por empresa" className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-ink-3" />
      </label>
      <p className="text-tiny text-ink-3" role="status">
        {pausa ? "En pausa." : "Se actualiza cada 10 s."} {visibles.length} sucesos{error ? " · no se pudo actualizar" : ""}. Solo metadatos: nunca el contenido de las tareas.
      </p>
      <ol className="flex max-h-[28rem] flex-col gap-1 overflow-y-auto pr-1">
        <AnimatePresence initial={false}>
          {visibles.map((s) => {
            const { icono: Icono, texto, tono } = describir(s);
            return (
              <motion.li
                key={`${s.tipo}-${s.cuando}-${s.empresaId}-${s.agente ?? ""}`}
                layout={!reducido}
                initial={reducido ? false : { opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="flex items-start gap-3 rounded-card px-2 py-2 hover:bg-white/5"
              >
                <Icono size={16} aria-hidden="true" className={`mt-0.5 shrink-0 ${tono ?? "text-ink-2"}`} />
                <span className="min-w-0 flex-1 text-small text-ink-2">
                  {texto}
                  <span className="block truncate text-tiny text-ink-3">{s.empresa}</span>
                </span>
                <time dateTime={s.cuando} className="shrink-0 text-tiny text-ink-3 tabular-nums">{hora(s.cuando)}</time>
              </motion.li>
            );
          })}
        </AnimatePresence>
        {visibles.length === 0 && <li className="px-2 py-6 text-center text-small text-ink-3">Nada que mostrar con estos filtros.</li>}
      </ol>
    </GlassPanel>
  );
}
