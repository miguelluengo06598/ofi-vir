"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Brain, Coins, LayoutGrid, MessageSquare, Radio, ShieldCheck, Sparkles, type LucideIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ApprovalsProvider, useApprovals } from "@/components/ApprovalsProvider";
import { ApprovalCard } from "@/components/approvals/ApprovalCard";
import { AjustesPanel } from "@/components/creditos/AjustesPanel";
import { ConsumoPanel } from "@/components/creditos/ConsumoPanel";
import { CreditosDeEjemplo } from "@/components/creditos/CreditosProvider";
import { SaldoPanel } from "@/components/creditos/SaldoPanel";
import { Avatar, StatusBadge, departmentMeta } from "@/components/glass";
import { HandoffLayer } from "@/components/handoffs/HandoffLayer";
import { LivePanel } from "@/components/handoffs/LivePanel";
import { HandoffPair } from "@/components/handoffs/parts";
import { MemoryGraph, type GraphCluster } from "@/components/memory/MemoryGraph";
import { initialMemory, type MemoryNode } from "@/data/memory";
import { buildAdjacency, selectClusters } from "@/lib/memorySelect";
import { ChatPanel } from "@/components/messages/ChatPanel";
import { ConversationList } from "@/components/messages/ConversationList";
import { DepartmentCard } from "@/components/office/DepartmentCard";
import { SimulationProvider } from "@/components/SimulationProvider";
import { recorridoProducto, resumenCreditosEjemplo, type VistaOficina } from "@/content/producto";
import { approvals } from "@/data/approvals";
import { departmentInfo } from "@/data/departments";
import { allHandoffs, kindLabel } from "@/data/handoffs";
import { initialConversations } from "@/data/messages";
import { fmtNumber } from "@/lib/format";

const nada = () => {};

const NAV: { vista: VistaOficina[]; icono: LucideIcon; label: string }[] = [
  { vista: ["oficina", "departamento"], icono: LayoutGrid, label: "Oficina" },
  { vista: ["mensajes"], icono: MessageSquare, label: "Mensajes" },
  { vista: ["aprobaciones"], icono: ShieldCheck, label: "Aprobaciones" },
  { vista: ["memoria"], icono: Brain, label: "Memoria" },
  { vista: ["directo"], icono: Radio, label: "En directo" },
  { vista: ["creditos"], icono: Coins, label: "Créditos" },
];

/**
 * Réplica de la interfaz de la oficina para el recorrido de /producto: el marco (dock y barra) y, dentro,
 * las vistas REALES de la oficina con sus datos de ejemplo. `paso` decide qué se ve y qué se resalta.
 * Es una ilustración: inerte (sin foco ni clics) y descrita en el texto del recorrido.
 * El escenario lleva transform para que los paneles «fixed» de la oficina (En directo) se queden dentro.
 */
export default function ReplicaOficina({ paso }: { paso: number }) {
  return (
    <ApprovalsProvider>
      <SimulationProvider>
        <Ajuste>
          <Marco paso={paso} />
        </Ajuste>
      </SimulationProvider>
    </ApprovalsProvider>
  );
}

/** Ancho mínimo al que se pinta la réplica; por debajo, se reduce entera como una miniatura. */
const ANCHO_DISENO = 900;

/**
 * En pantallas estrechas la réplica se pinta a 900 px y se reduce con `zoom` (como una captura): así se
 * reconoce la interfaz en vez de aplastarla. En esos anchos no hay capa de traspasos (solo ≥ 1024 px),
 * que es lo único que mide posiciones, así que el zoom no descuadra nada.
 */
function Ajuste({ children }: { children: React.ReactNode }) {
  const caja = useRef<HTMLDivElement>(null);
  const [medida, setMedida] = useState<{ w: number; h: number } | null>(null);
  useEffect(() => {
    const el = caja.current;
    if (!el) return;
    const medir = () => setMedida({ w: el.clientWidth, h: el.clientHeight });
    medir();
    const obs = new ResizeObserver(medir);
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  const zoom = medida && medida.w < ANCHO_DISENO * 0.85 ? medida.w / ANCHO_DISENO : 1;
  return (
    <div ref={caja} className="size-full overflow-hidden">
      <div style={zoom < 1 && medida ? { width: ANCHO_DISENO, height: medida.h / zoom, zoom } : { width: "100%", height: "100%" }}>{children}</div>
    </div>
  );
}

function Marco({ paso }: { paso: number }) {
  const vista: VistaOficina = recorridoProducto[paso]?.vista ?? "oficina";
  const foco = recorridoProducto[paso]?.foco;
  const { office, pendingCount } = useApprovals();

  return (
    <div inert className="relative flex size-full overflow-hidden rounded-card bg-black/35 text-white ring-1 ring-white/15 [transform:translateZ(0)]">
      {/* Dock */}
      <nav aria-hidden="true" className="flex w-14 shrink-0 flex-col items-center gap-2 border-r border-white/10 py-3">
        <span className="mb-2 flex size-8 items-center justify-center rounded-full bg-linear-to-br from-accent to-dept-operaciones">
          <Sparkles size={15} />
        </span>
        {NAV.map(({ vista: v, icono: Icono, label }) => {
          const activo = v.includes(vista);
          return (
            <span key={label} title={label} className={`relative flex size-9 items-center justify-center rounded-full transition-colors duration-300 ${activo ? "bg-white text-black" : "text-ink-2"}`}>
              <Icono size={16} />
              {activo && paso >= 0 && <span className="absolute -inset-1 rounded-full ring-2 ring-[#FFD48A]/80" />}
            </span>
          );
        })}
      </nav>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Barra superior */}
        <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-2.5 text-small">
          <span className="font-semibold">Clínica Sol · Oficina</span>
          <span className="flex items-center gap-2">
            <span className={`rounded-pill px-3 py-1 ring-1 transition-colors duration-300 ${vista === "aprobaciones" ? "bg-status-waiting/25 ring-status-waiting/60" : "bg-white/10 ring-white/15"}`}>
              {pendingCount} aprobaciones
            </span>
            <span className={`rounded-pill px-3 py-1 ring-1 transition-colors duration-300 ${vista === "creditos" ? "bg-[#FFD48A]/25 ring-[#FFD48A]/60" : "bg-white/10 ring-white/15"}`}>
              {fmtNumber(resumenCreditosEjemplo.saldo.disponible)} créditos
            </span>
          </span>
        </div>

        <div className="relative min-h-0 flex-1 overflow-hidden p-4">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={vista}
              className="size-full"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
            >
              {vista === "oficina" && <VistaDepartamentos />}
              {vista === "departamento" && <VistaPanelDepartamento />}
              {vista === "mensajes" && <VistaMensajes agentes={office.summaries.flatMap((s) => s.agents)} />}
              {vista === "aprobaciones" && <VistaAprobaciones />}
              {vista === "memoria" && <VistaMemoria />}
              {vista === "directo" && (
                <>
                  {/* El panel En directo es «fixed»: se coloca abajo a la derecha del escenario. */}
                  <div className="pr-[23.5rem]"><VistaDepartamentos columnas={2} /></div>
                  <LivePanel />
                </>
              )}
              {vista === "creditos" && (
                <CreditosDeEjemplo resumen={resumenCreditosEjemplo}>
                  {/* Más pequeño (zoom) para que quepan los paneles reales; aquí no hay nada que mida posiciones. */}
                  <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.45fr)] gap-3 [zoom:0.78]">
                    <SaldoPanel />
                    <ConsumoPanel />
                    <div className="col-span-2"><AjustesPanel /></div>
                  </div>
                </CreditosDeEjemplo>
              )}
            </motion.div>
          </AnimatePresence>

          {/* Etiqueta de lo que se resalta en este paso */}
          {foco && paso >= 0 && (
            <span key={foco} className="absolute top-3 right-3 z-40 rounded-pill bg-[#FFD48A] px-3 py-1 text-tiny font-semibold text-black shadow-lg">
              {foco}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function VistaDepartamentos({ columnas = 3 }: { columnas?: 2 | 3 }) {
  const { office } = useApprovals();
  const fila = useRef<HTMLDivElement>(null);
  return (
    <div ref={fila} className="relative pt-10">
      <HandoffLayer containerRef={fila} layoutKey="replica" />
      <div className={`grid gap-3 ${columnas === 2 ? "grid-cols-2" : "grid-cols-3"}`}>
        {office.summaries.map((s, i) => (
          <DepartmentCard key={s.id} summary={s} filter="all" delay={0.03 * i} onOpen={nada} />
        ))}
      </div>
    </div>
  );
}

function VistaPanelDepartamento() {
  const { office } = useApprovals();
  const ventas = office.summaries.find((s) => s.id === "ventas")!;
  const meta = departmentMeta.ventas;
  const Icono = meta.icon;
  const relacionados = allHandoffs.filter((h) => h.fromDepartmentId === "ventas" || h.toDepartmentId === "ventas").slice(0, 4);
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-card bg-white/5 ring-1 ring-white/10">
      <div className={`flex items-center gap-2 px-4 py-3 text-small font-semibold ${meta.header}`}>
        <Icono size={16} /> {meta.label}
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(13rem,0.9fr)_minmax(0,1.3fr)] gap-4 p-4">
        <div className="flex min-w-0 flex-col gap-3">
          <p className="text-small text-ink-2">{departmentInfo.ventas.description}</p>
          <dl className="grid grid-cols-2 gap-2">
            {departmentInfo.ventas.metrics.map((m) => (
              <div key={m.label} className="rounded-card bg-black/25 p-3">
                <dt className="text-tiny text-ink-2">{m.label}</dt>
                <dd className="text-h2">{m.value}</dd>
              </div>
            ))}
          </dl>
          <ul className="flex flex-col gap-2">
            {ventas.agents.map((a) => (
              <li key={a.id} className="flex items-center gap-2 text-small">
                <Avatar name={a.name} tone="ventas" size={30} status={a.status} />
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{a.name}</span>
                  <StatusBadge status={a.status} />
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div className="relative flex min-w-0 flex-col gap-2 overflow-hidden rounded-card p-2 ring-2 ring-[#FFD48A]/70">
          <p className="px-1 text-small font-semibold">Enviado y recibido</p>
          {relacionados.map((h) => (
            <div key={h.id} className="flex min-w-0 items-center gap-2 rounded-card bg-black/25 p-2 text-small">
              <HandoffPair handoff={h} size={24} />
              <span className="min-w-0 flex-1">
                <span className="block text-tiny text-ink-2">{kindLabel[h.kind]} · {h.fromDepartmentId === "ventas" ? "enviado" : "recibido"}</span>
                <span className="block truncate">{h.summary}</span>
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function VistaMensajes({ agentes }: { agentes: ReturnType<typeof useApprovals>["office"]["summaries"][number]["agents"] }) {
  const conversacion = initialConversations[0];
  const agente = agentes.find((a) => a.id === conversacion.agentId) ?? agentes[0];
  return (
    <div className="grid h-full grid-cols-[15rem_1fr] gap-3 overflow-hidden">
      <div className="overflow-hidden">
        <ConversationList
          agents={agentes}
          conversations={initialConversations}
          selectedId={agente.id}
          query=""
          tab="all"
          picking={false}
          onQuery={nada}
          onTab={nada}
          onSelect={nada}
          onStart={nada}
        />
      </div>
      <div className="min-w-0 overflow-hidden rounded-card ring-2 ring-[#FFD48A]/70">
        <ChatPanel agent={agente} conversation={conversacion} typing={false} draft="" onDraft={nada} onSend={nada} onBack={nada} />
      </div>
    </div>
  );
}

function VistaAprobaciones() {
  const { office, resolved } = useApprovals();
  const agentes = office.summaries.flatMap((s) => s.agents);
  const pendientes = approvals.filter((a) => !resolved.has(a.id)).slice(0, 2);
  return (
    <div className="grid h-full grid-cols-2 gap-3 overflow-hidden">
      {pendientes.map((a, i) => {
        const agente = agentes.find((x) => x.id === a.agentId);
        return agente ? (
          <div key={a.id} className={i === 0 ? "rounded-card ring-2 ring-[#FFD48A]/70" : undefined}>
            <ApprovalCard approval={a} agent={agente} delay={0} />
          </div>
        ) : null;
      })}
    </div>
  );
}

const VACIO = new Set<string>();

/**
 * La constelación de la memoria (el grafo real de la oficina) con sus datos de ejemplo. Tras un instante
 * se «pulsa» el contacto principal de un racimo y se iluminan sus conexiones, como al hacer clic.
 */
function VistaMemoria() {
  const data = useMemo(() => initialMemory(), []);
  const adjacency = useMemo(() => buildAdjacency(data.edges), [data.edges]);
  const clusters: GraphCluster[] = useMemo(() => {
    const { visible } = selectClusters({ clients: data.clients, nodes: data.nodes, matches: VACIO, searching: false, showAll: false });
    const porCliente = new Map<string, MemoryNode[]>();
    for (const n of data.nodes) porCliente.set(n.clientId, [...(porCliente.get(n.clientId) ?? []), n]);
    return visible.map((client) => {
      const nodes = porCliente.get(client.id) ?? [];
      const ids = new Set(nodes.map((n) => n.id));
      return { client, nodes, edges: data.edges.filter((e) => ids.has(e.from) && ids.has(e.to)) };
    });
  }, [data]);
  const [seleccion, setSeleccion] = useState<string | null>(null);

  useEffect(() => {
    // El nodo con más conexiones del primer racimo: así se ve bien la constelación iluminada.
    const nodos = clusters[0]?.nodes ?? [];
    const principal = [...nodos].sort((a, b) => (adjacency.get(b.id)?.size ?? 0) - (adjacency.get(a.id)?.size ?? 0))[0];
    if (!principal) return;
    const t = setTimeout(() => setSeleccion(principal.id), 900);
    return () => clearTimeout(t);
  }, [clusters, adjacency]);

  const lit = seleccion ? new Set([seleccion, ...(adjacency.get(seleccion) ?? [])]) : null;
  return (
    <div className="flex h-full flex-col">
      <p className="text-h2">Memoria</p>
      <p className="text-small text-ink-2">Todo lo que tus agentes saben de tus clientes y cómo se conecta.</p>
      <div className="mt-2 min-h-0 flex-1 overflow-hidden rounded-card ring-2 ring-[#FFD48A]/60">
        <MemoryGraph
          clusters={clusters}
          hiddenIds={VACIO}
          selectedId={seleccion}
          lit={lit}
          matches={VACIO}
          searching={false}
          adjacency={adjacency}
          onSelect={nada}
        />
      </div>
    </div>
  );
}
