"use client";

import { List, Network, RotateCcw, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useApprovals } from "@/components/ApprovalsProvider";
import { borrarContactoDeMemoria, corregirRecuerdo } from "@/app/actions/memoria";
import { GlassInput, GlassPanel, PillButton, departmentMeta, type DepartmentId } from "@/components/glass";
import { currentUser } from "@/data/navigation";
import { departmentOrder } from "@/data/departments";
import {
  initialMemory,
  nodeDepartment,
  nodeTypeLabel,
  nodeTypeOrder,
  type MemoryData,
  type MemoryNode,
  type NodeType,
} from "@/data/memory";
import { localIso } from "@/lib/format";
import { RECENT_CLUSTERS, buildAdjacency, matchingNodeIds, normalize, selectClusters } from "@/lib/memorySelect";
import { useMediaQuery } from "@/lib/useMediaQuery";
import { MemoryDetail } from "./MemoryDetail";
import { MemoryGraph, type GraphCluster } from "./MemoryGraph";
import { MemoryList } from "./MemoryList";
import { NodeGlyph } from "./NodeGlyph";

type Props = {
  initialData?: MemoryData | null;
  /** Oficina real: la memoria de la empresa (nunca se rellena con ejemplos) y los cambios se guardan en la base. */
  real?: boolean;
  /** Corregir y borrar: solo propietarios y administradores. */
  puedeEditar?: boolean;
};

export function MemoryView({ initialData, real = false, puedeEditar = true }: Props) {
  const { agente, usuario } = useApprovals();
  const vacia: MemoryData = { clients: [], nodes: [], edges: [] };
  const [data, setData] = useState<MemoryData>(() => initialData ?? (real ? vacia : initialMemory()));
  const sinConexion = real && initialData === null;
  // Departamento de un nodo: el del agente que lo creó (en la oficina real, sus agentes de verdad).
  const departamentoDe = (n: MemoryNode): DepartmentId => (real ? (agente(n.creatorId)?.departmentId ?? "direccion") : nodeDepartment(n));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [types, setTypes] = useState<Set<NodeType>>(new Set());
  const [dept, setDept] = useState<DepartmentId | "all">("all");
  const [showAll, setShowAll] = useState(false);
  const [mode, setMode] = useState<"graph" | "list">("graph");
  const [announcement, setAnnouncement] = useState("");
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const showGraph = isDesktop && mode === "graph";

  const searching = normalize(query) !== "";
  const adjacency = useMemo(() => buildAdjacency(data.edges), [data.edges]);
  const matches = useMemo(() => matchingNodeIds(data.nodes, query), [data.nodes, query]);

  // Qué racimos se dibujan: los recientes, o los que contienen coincidencias.
  const selection = useMemo(
    () => selectClusters({ clients: data.clients, nodes: data.nodes, matches, searching, showAll }),
    [data.clients, data.nodes, matches, searching, showAll],
  );

  const clusters: GraphCluster[] = useMemo(() => {
    const nodesBy = new Map<string, MemoryNode[]>();
    for (const n of data.nodes) nodesBy.set(n.clientId, [...(nodesBy.get(n.clientId) ?? []), n]);
    return selection.visible.map((client) => {
      const nodes = nodesBy.get(client.id) ?? [];
      const ids = new Set(nodes.map((n) => n.id));
      return { client, nodes, edges: data.edges.filter((e) => ids.has(e.from) && ids.has(e.to)) };
    });
  }, [selection.visible, data.nodes, data.edges]);

  // Filtros por tipo y departamento: ocultan nodos sin recolocar el resto.
  const hiddenIds = useMemo(() => {
    const hidden = new Set<string>();
    for (const n of data.nodes) {
      if ((types.size > 0 && !types.has(n.type)) || (dept !== "all" && departamentoDe(n) !== dept)) hidden.add(n.id);
    }
    return hidden;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- departamentoDe solo depende de la oficina cargada
  }, [data.nodes, types, dept]);

  const selected = useMemo(() => {
    if (!selectedId || hiddenIds.has(selectedId)) return null;
    const cluster = clusters.find((c) => c.nodes.some((n) => n.id === selectedId));
    const node = cluster?.nodes.find((n) => n.id === selectedId);
    return cluster && node ? { cluster, node } : null;
  }, [selectedId, hiddenIds, clusters]);

  const lit = useMemo(
    () => (selected ? new Set([selected.node.id, ...(adjacency.get(selected.node.id) ?? [])]) : null),
    [selected, adjacency],
  );

  const shownNodes = clusters.reduce((n, c) => n + c.nodes.filter((x) => !hiddenIds.has(x.id)).length, 0);
  const shownMatches = clusters.reduce((n, c) => n + c.nodes.filter((x) => matches.has(x.id) && !hiddenIds.has(x.id)).length, 0);

  const select = (id: string | null) => {
    setSelectedId(id);
    const node = id ? data.nodes.find((n) => n.id === id) : null;
    setAnnouncement(node ? `${nodeTypeLabel[node.type].singular} ${node.label} seleccionado.` : "");
  };

  const toggleType = (t: NodeType) =>
    setTypes((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });

  const editNode = async (id: string, fields: { label: string; detail: string }) => {
    if (real) {
      const r = await corregirRecuerdo({ nodeId: id, titulo: fields.label, contenido: fields.detail });
      if (!r.ok) return setAnnouncement(r.mensaje);
    }
    setData((d) => ({
      ...d,
      nodes: d.nodes.map((n) =>
        n.id !== id || (n.label === fields.label && n.detail === fields.detail)
          ? n
          : { ...n, ...fields, events: [...n.events, { at: localIso(), text: `Corregido por ${real ? (usuario ?? "ti") : currentUser.name}.` }] },
      ),
    }));
    setAnnouncement("Cambios guardados.");
  };

  const deleteClient = async (clientId: string) => {
    const client = data.clients.find((c) => c.id === clientId);
    if (real) {
      const r = await borrarContactoDeMemoria({ contactId: clientId });
      if (!r.ok) return setAnnouncement(r.mensaje);
    }
    const removed = new Set(data.nodes.filter((n) => n.clientId === clientId).map((n) => n.id));
    setData((d) => ({
      clients: d.clients.filter((c) => c.id !== clientId),
      nodes: d.nodes.filter((n) => !removed.has(n.id)),
      edges: d.edges.filter((e) => !removed.has(e.from) && !removed.has(e.to)),
    }));
    setSelectedId(null);
    setAnnouncement(`Se ha borrado todo lo de ${client?.name}: ${removed.size} nodos.`);
  };

  const restore = () => {
    setData(initialData ?? initialMemory());
    setSelectedId(null);
    setAnnouncement("Datos de ejemplo restaurados.");
  };

  const clearFilters = () => {
    setQuery("");
    setTypes(new Set());
    setDept("all");
  };

  const filtering = searching || types.size > 0 || dept !== "all";
  const empty = data.clients.length === 0;
  const nothingShown = !empty && shownNodes === 0;

  const detail = selected && (
    <MemoryDetail
      key={selected.node.id}
      node={selected.node}
      client={selected.cluster.client}
      nodes={selected.cluster.nodes}
      edges={selected.cluster.edges}
      onClose={() => select(null)}
      onSelect={select}
      onEdit={editNode}
      onDeleteClient={deleteClient}
      real={real}
      puedeEditar={puedeEditar}
    />
  );

  return (
    <div className="flex flex-col gap-4 md:h-[calc(100dvh-11rem)] lg:h-[calc(100dvh-9rem)]">
      <div role="status" aria-live="polite" className="sr-only">
        {announcement}
      </div>

      <div className="flex flex-col gap-1">
        <h1 className="text-h1">Memoria</h1>
        <p className="text-body text-ink-2">Todo lo que tus agentes saben de tus clientes y cómo se conecta</p>
      </div>

      <GlassPanel as="section" aria-label="Buscar y filtrar" className="enter flex flex-col gap-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <GlassInput
            icon={Search}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Busca «Laura» o «precio»"
            aria-label="Buscar en la memoria"
            className="min-w-56 flex-1"
          />
          {searching && <PillButton icon={X} aria-label="Borrar búsqueda" onClick={() => setQuery("")} />}
          {isDesktop && (
            <div role="group" aria-label="Forma de verlo" className="flex gap-2">
              <PillButton icon={Network} active={mode === "graph"} onClick={() => setMode("graph")}>
                Red
              </PillButton>
              <PillButton icon={List} active={mode === "list"} onClick={() => setMode("list")}>
                Lista
              </PillButton>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div role="group" aria-label="Filtrar por tipo de nodo" className="flex flex-wrap gap-2">
            <PillButton compact active={types.size === 0} onClick={() => setTypes(new Set())}>
              Todos los tipos
            </PillButton>
            {nodeTypeOrder.map((t) => (
              <PillButton key={t} compact active={types.has(t)} onClick={() => toggleType(t)}>
                <NodeGlyph type={t} size={14} />
                {nodeTypeLabel[t].plural}
              </PillButton>
            ))}
          </div>
        </div>
        <div role="group" aria-label="Filtrar por departamento" className="flex flex-wrap gap-2">
          <PillButton compact active={dept === "all"} onClick={() => setDept("all")}>
            Todos los departamentos
          </PillButton>
          {departmentOrder.map((id) => (
            <PillButton key={id} compact icon={departmentMeta[id].icon} active={dept === id} onClick={() => setDept(id)}>
              {departmentMeta[id].label}
            </PillButton>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-small text-ink-2">
          <p role="status" aria-live="polite">
            {empty
              ? "No hay clientes en la memoria."
              : searching
                ? `${shownMatches} ${shownMatches === 1 ? "coincidencia" : "coincidencias"} en ${selection.visible.length} de ${data.clients.length} clientes`
                : selection.mode === "recent"
                  ? `Mostrando los ${RECENT_CLUSTERS} clientes más recientes de ${data.clients.length}`
                  : `${data.clients.length} ${data.clients.length === 1 ? "cliente" : "clientes"} · ${shownNodes} nodos`}
          </p>
          {!searching && !empty && data.clients.length > RECENT_CLUSTERS && (
            <PillButton compact onClick={() => setShowAll((v) => !v)}>
              {showAll ? "Solo los recientes" : `Ver toda la red (${selection.hiddenCount} más)`}
            </PillButton>
          )}
          {filtering && (
            <PillButton compact icon={RotateCcw} onClick={clearFilters}>
              Quitar filtros
            </PillButton>
          )}
        </div>
      </GlassPanel>

      {empty ? (
        <GlassPanel className="enter flex flex-col items-start gap-3 p-6">
          <h2 className="text-h2">{sinConexion ? "No se ha podido cargar la memoria" : "La memoria está vacía"}</h2>
          <p className="text-small text-ink-2">
            {sinConexion
              ? "Vuelve a intentarlo en unos segundos."
              : real
                ? "Tus agentes guardarán aquí lo que aprendan de cada contacto (datos, acuerdos, objeciones, pendientes) a medida que trabajen."
                : "Has borrado todos los clientes. Los agentes irán guardando datos nuevos a medida que trabajen."}
          </p>
          {!real && (
            <PillButton icon={RotateCcw} onClick={restore}>
              Restaurar datos de ejemplo
            </PillButton>
          )}
        </GlassPanel>
      ) : nothingShown ? (
        <GlassPanel className="enter flex flex-col items-start gap-3 p-6">
          <h2 className="text-h2">Nada que mostrar</h2>
          <p className="text-small text-ink-2">
            {searching ? `Ningún elemento coincide con «${query.trim()}» con los filtros actuales.` : "Los filtros actuales ocultan todos los nodos."}
          </p>
          <PillButton icon={RotateCcw} onClick={clearFilters}>
            Quitar búsqueda y filtros
          </PillButton>
        </GlassPanel>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-4 md:flex-row">
          {/* En móvil, al elegir un nodo su ficha sustituye a la lista; el botón de cerrar la devuelve. */}
          {!(selected && !isDesktop) && (
            <div className="min-h-0 min-w-0 flex-1 md:overflow-y-auto">
              {showGraph ? (
                <MemoryGraph
                  clusters={clusters}
                  hiddenIds={hiddenIds}
                  selectedId={selected?.node.id ?? null}
                  lit={lit}
                  matches={matches}
                  searching={searching}
                  adjacency={adjacency}
                  onSelect={select}
                />
              ) : (
                <MemoryList
                  clusters={clusters}
                  hiddenIds={hiddenIds}
                  selectedId={selected?.node.id ?? null}
                  matches={matches}
                  searching={searching}
                  adjacency={adjacency}
                  onSelect={select}
                />
              )}
            </div>
          )}
          {detail && <div className="min-h-0 w-full md:w-[24rem] md:shrink-0">{detail}</div>}
        </div>
      )}
    </div>
  );
}
