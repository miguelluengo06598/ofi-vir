"use client";

import { Pencil, Trash2, X } from "lucide-react";
import { useRef, useState } from "react";
import { Avatar, GlassInput, GlassPanel, PillButton, departmentMeta } from "@/components/glass";
import { agentById } from "@/data/agents";
import {
  edgeKindLabel,
  nodeDepartment,
  nodeTypeLabel,
  type MemoryClient,
  type MemoryEdge,
  type MemoryNode,
} from "@/data/memory";
import { fmtDateTime } from "@/lib/format";
import { NodeGlyph } from "./NodeGlyph";

type Props = {
  node: MemoryNode;
  client: MemoryClient;
  /** Nodos del mismo racimo (para resolver las conexiones). */
  nodes: MemoryNode[];
  edges: MemoryEdge[];
  onClose: () => void;
  onSelect: (id: string) => void;
  onEdit: (id: string, fields: { label: string; detail: string }) => void;
  onDeleteClient: (clientId: string) => void;
};

/** Ficha del nodo elegido. Un solo panel de cristal a la derecha del grafo. */
export function MemoryDetail({ node, client, nodes, edges, onClose, onSelect, onEdit, onDeleteClient }: Props) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [label, setLabel] = useState(node.label);
  const [detail, setDetail] = useState(node.detail);
  const editBtn = useRef<HTMLButtonElement>(null);
  const deleteBtn = useRef<HTMLButtonElement>(null);

  const creator = agentById(node.creatorId);
  const dept = departmentMeta[nodeDepartment(node)];
  const byId = new Map(nodes.map((n) => [n.id, n]));

  // Conexiones leídas desde el nodo: «trabaja en → Clínica Sol», «← Laura Gómez · recibió».
  const related = edges
    .filter((e) => e.from === node.id || e.to === node.id)
    .map((e) => {
      const outgoing = e.from === node.id;
      const other = byId.get(outgoing ? e.to : e.from);
      return other ? { id: e.id, other, text: outgoing ? edgeKindLabel[e.kind] : `${edgeKindLabel[e.kind]} (de)` } : null;
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  const history = [
    { at: node.createdAt, text: `Creado por ${creator.name}.` },
    ...node.events,
  ].sort((a, b) => a.at.localeCompare(b.at));

  const closeEdit = () => {
    setEditing(false);
    requestAnimationFrame(() => editBtn.current?.focus());
  };
  const closeConfirm = () => {
    setConfirming(false);
    requestAnimationFrame(() => deleteBtn.current?.focus());
  };

  const clusterCount = nodes.length;

  return (
    <GlassPanel
      as="aside"
      aria-label={`Detalle: ${node.label}`}
      className="enter flex max-h-full min-h-0 w-full flex-col gap-5 overflow-y-auto p-5 sm:p-6"
    >
      <div className="flex items-start gap-3">
        <span className="mt-1.5">
          <NodeGlyph type={node.type} size={22} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-tiny tracking-wide text-ink-2 uppercase">{nodeTypeLabel[node.type].singular}</p>
          <h2 className="text-h2 break-words">{node.label}</h2>
        </div>
        <PillButton icon={X} aria-label="Cerrar detalle" onClick={onClose} />
      </div>

      {editing ? (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            const l = label.trim();
            if (!l) return;
            onEdit(node.id, { label: l, detail: detail.trim() });
            closeEdit();
          }}
        >
          <label className="flex flex-col gap-1 text-small">
            Nombre
            <GlassInput value={label} onChange={(e) => setLabel(e.target.value)} required maxLength={60} autoFocus aria-label="Nombre del nodo" />
          </label>
          <label className="flex flex-col gap-1 text-small">
            Qué es
            <textarea
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
              rows={4}
              maxLength={300}
              className="rounded-card border border-glass-border bg-white/10 p-3 text-small text-white outline-none focus-visible:outline-2 focus-visible:outline-white"
            />
          </label>
          <div className="flex gap-2">
            <PillButton type="submit" active>
              Guardar
            </PillButton>
            <PillButton
              onClick={() => {
                setLabel(node.label);
                setDetail(node.detail);
                closeEdit();
              }}
            >
              Cancelar
            </PillButton>
          </div>
        </form>
      ) : (
        <section aria-label="Qué es">
          <p className="text-small text-ink-2">{node.detail}</p>
        </section>
      )}

      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-small">
        <dt className="text-ink-2">Creado</dt>
        <dd>{fmtDateTime(node.createdAt)}</dd>
        <dt className="text-ink-2">Creado por</dt>
        <dd className="flex items-center gap-2">
          <Avatar name={creator.name} tone={nodeDepartment(node)} size={24} />
          <span>
            {creator.name}
            <span className="block text-tiny text-ink-2">{dept.label}</span>
          </span>
        </dd>
        <dt className="text-ink-2">Cliente</dt>
        <dd>
          {client.name} · {client.company}
        </dd>
      </dl>

      <section aria-labelledby="mem-related" className="flex flex-col gap-2">
        <h3 id="mem-related" className="text-small font-semibold">
          Nodos relacionados ({related.length})
        </h3>
        <ul className="flex flex-col gap-1">
          {related.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => onSelect(r.other.id)}
                className="flex w-full cursor-pointer items-center gap-2 rounded-card px-2 py-1.5 text-left text-small hover:bg-white/10"
              >
                <NodeGlyph type={r.other.type} size={16} />
                <span className="min-w-0 flex-1 truncate">{r.other.label}</span>
                <span className="text-tiny text-ink-2">{r.text}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="mem-history" className="flex flex-col gap-2">
        <h3 id="mem-history" className="text-small font-semibold">
          Historial
        </h3>
        <ol className="flex flex-col gap-3 border-l border-glass-border pl-4">
          {history.map((h, i) => (
            <li key={i} className="relative text-small">
              <span aria-hidden="true" className="absolute top-1.5 -left-[21px] size-2 rounded-full bg-white" />
              <time dateTime={h.at} className="block text-tiny text-ink-2">
                {fmtDateTime(h.at)}
              </time>
              {h.text}
            </li>
          ))}
        </ol>
      </section>

      <div className="flex flex-col gap-3 border-t border-glass-border pt-4">
        {!editing && (
          <PillButton ref={editBtn} icon={Pencil} onClick={() => setEditing(true)} className="self-start">
            Corregir
          </PillButton>
        )}
        {confirming ? (
          <div role="alertdialog" aria-labelledby="mem-confirm-title" aria-describedby="mem-confirm-text" className="flex flex-col gap-3 rounded-card border border-red-300/50 bg-red-500/15 p-4">
            <p id="mem-confirm-title" className="text-small font-semibold">
              ¿Borrar todo lo de {client.name}?
            </p>
            <p id="mem-confirm-text" className="text-small text-ink-2">
              Se eliminarán sus {clusterCount} nodos y todas sus conexiones: la empresa, la campaña, los correos, los datos y las tareas. No se puede deshacer.
            </p>
            <div className="flex flex-wrap gap-2">
              <PillButton autoFocus onClick={closeConfirm}>
                Cancelar
              </PillButton>
              <PillButton icon={Trash2} className="border-red-300/70 bg-red-500/40!" onClick={() => onDeleteClient(client.id)}>
                Sí, borrar todo
              </PillButton>
            </div>
          </div>
        ) : (
          <PillButton ref={deleteBtn} icon={Trash2} onClick={() => setConfirming(true)} className="self-start border-red-300/50">
            Borrar todo lo de este contacto
          </PillButton>
        )}
      </div>
    </GlassPanel>
  );
}
