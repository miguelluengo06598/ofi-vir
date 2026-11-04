import { Brain } from "lucide-react";
import type { LearnedNode } from "@/lib/agents/store";

const tipoTexto: Record<string, string> = { dato: "Dato", empresa: "Empresa", tarea: "Pendiente", contacto: "Contacto" };

/** «Lucía ha recordado 3 cosas», con cada recuerdo y su confianza. Siempre con texto, nunca solo color. */
export function Aprendido({ nombre, items, titulo }: { nombre: string; items: LearnedNode[]; titulo?: string }) {
  const first = nombre.split(" ")[0];
  return (
    <div className="flex flex-col gap-1.5">
      <p className="flex items-center gap-2 text-small font-semibold">
        <Brain size={16} aria-hidden="true" className="shrink-0" />
        {first} ha recordado {items.length} {items.length === 1 ? "cosa" : "cosas"}
        {titulo ? <span className="font-normal text-ink-3"> · {titulo}</span> : null}
      </p>
      <ul className="flex flex-col gap-1">
        {items.map((n) => (
          <li key={n.id} className="rounded-card bg-white/6 px-3 py-2 text-small">
            <span className="text-ink-2">{n.title}</span>
            {n.content && <span className="block text-tiny text-ink-3">{n.content}</span>}
            <span className="block text-tiny text-ink-3">
              {tipoTexto[n.type] ?? n.type} · confianza {Math.round(n.confidence * 100)} % · deducido por {first}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
