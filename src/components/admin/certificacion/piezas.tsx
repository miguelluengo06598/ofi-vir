import { GlassPanel } from "@/components/glass";
import type { RevisionHecha } from "@/lib/admin/certificacion/servicio";
import { CHECKLIST, NOMBRE_DECISION, type Decision, type Espera } from "@/lib/admin/certificacion/config";

export function Seccion({ id, titulo, nota, children }: { id: string; titulo: string; nota?: string; children: React.ReactNode }) {
  return (
    <GlassPanel as="section" aria-labelledby={id} className="flex flex-col gap-4 p-5 sm:p-6">
      <div>
        <h2 id={id} className="text-h2">{titulo}</h2>
        {nota && <p className="mt-1 text-small text-ink-2">{nota}</p>}
      </div>
      {children}
    </GlassPanel>
  );
}

export type Col = { t: string; der?: boolean };
export function Tabla({ caption, cols, children, vacio, textoVacio = "No hay nada aquí." }: { caption: string; cols: Col[]; children: React.ReactNode; vacio?: boolean; textoVacio?: string }) {
  if (vacio) return <p className="rounded-card bg-white/6 p-4 text-small text-ink-2">{textoVacio}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-left text-small">
        <caption className="sr-only">{caption}</caption>
        <thead className="text-tiny text-ink-3">
          <tr>{cols.map((c) => <th key={c.t} scope="col" className={`py-2 pr-3 font-normal ${c.der ? "text-right" : ""}`}>{c.t}</th>)}</tr>
        </thead>
        <tbody className="[&_td]:border-t [&_td]:border-glass-border [&_td]:py-2.5 [&_td]:pr-3 [&_td]:align-top [&_td:last-child]:pr-0">{children}</tbody>
      </table>
    </div>
  );
}

export const Etiqueta = ({ children, tono = "neutro" }: { children: React.ReactNode; tono?: "neutro" | "bien" | "aviso" | "mal" | "acento" }) => (
  <span className={`inline-block rounded-pill px-2 py-0.5 text-tiny whitespace-nowrap ${{ neutro: "bg-white/12", bien: "bg-status-working/25", aviso: "bg-status-waiting/25", mal: "bg-status-error/30", acento: "bg-accent/35" }[tono]}`}>{children}</span>
);

/** Tiempo en cola. Fuera de plazo va en rojo y, además, lo dice con texto (nunca solo color). */
export const TiempoEnCola = ({ espera }: { espera: Espera }) => (
  <span className={espera.fueraDePlazo ? "font-semibold text-status-error" : ""}>
    {espera.texto}
    <span className="block text-tiny font-normal">{espera.fueraDePlazo ? `Fuera de plazo (objetivo: ${espera.plazo} h)` : <span className="text-ink-3">objetivo: {espera.plazo} h</span>}</span>
  </span>
);

export const Dato = ({ t, children }: { t: string; children: React.ReactNode }) => (
  <div><dt className="text-tiny text-ink-3">{t}</dt><dd className="text-small break-words whitespace-pre-wrap">{children}</dd></div>
);

export const Bloque = ({ children }: { children: React.ReactNode }) => (
  <pre className="max-h-96 overflow-auto rounded-card bg-black/30 p-4 font-sans text-small whitespace-pre-wrap">{children}</pre>
);

const fecha = (iso: string) => new Date(iso).toLocaleString("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** Revisiones ya hechas sobre la solicitud (con sus notas internas: esto solo lo ve el equipo). */
export function RevisionesHechas({ revisiones }: { revisiones: RevisionHecha[] }) {
  if (revisiones.length === 0) return null;
  return (
    <ul className="flex flex-col gap-2">
      {revisiones.map((r, i) => {
        const fallos = r.checklist.filter((p) => !p.ok);
        return (
          <li key={i} className="rounded-card bg-white/6 p-3 text-small">
            <p className="flex flex-wrap items-center gap-2">
              <span className="font-semibold">{r.revisor}</span>
              <Etiqueta>{r.rol === "principal" ? "Revisión principal" : "Segunda opinión"}</Etiqueta>
              <Etiqueta tono={r.decision === "aprobar" ? "bien" : r.decision === "rechazar" ? "mal" : "aviso"}>{NOMBRE_DECISION[r.decision as Decision] ?? r.decision}</Etiqueta>
              <span className="text-tiny text-ink-3">{fecha(r.fecha)}</span>
            </p>
            {fallos.length > 0 && <p className="mt-1 text-ink-2">No cumple: {fallos.map((p) => `${CHECKLIST.find((c) => c.id === p.id)?.titulo ?? p.id}${p.comentario ? ` (${p.comentario})` : ""}`).join(" · ")}</p>}
            {r.comentario && <p className="mt-1"><span className="text-ink-3">Para la empresa: </span>{r.comentario}</p>}
            {r.notasInternas && <p className="mt-1"><span className="text-ink-3">Notas internas: </span>{r.notasInternas}</p>}
          </li>
        );
      })}
    </ul>
  );
}
