"use client";

import { AnimatePresence } from "framer-motion";
import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useApprovals } from "@/components/ApprovalsProvider";
import { GlassInput, PillButton, type DepartmentId } from "@/components/glass";
import { marketAgents, marketCategories, type MarketCategory } from "@/data/marketplace";
import { AgentSheet } from "./AgentSheet";
import { HireDialog } from "./HireDialog";
import { MarketCard } from "./MarketCard";

export function MarketplaceView() {
  const router = useRouter();
  const { office, hired, hire } = useApprovals();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<MarketCategory | "all">("all");
  const [selected, setSelected] = useState<string | null>(null);
  const [hireFor, setHireFor] = useState<string | null>(null);
  const opener = useRef<HTMLElement | null>(null);

  const { summaries } = office;
  const isHired = (id: string) => hired.some((h) => h.marketId === id);

  const q = query.trim().toLowerCase();
  const visible = marketAgents.filter(
    (a) =>
      (category === "all" || a.category === category) &&
      (!q || [a.name, a.role, a.summary, ...a.tools].some((t) => t.toLowerCase().includes(q))),
  );

  const remember = () => (opener.current = document.activeElement as HTMLElement | null);
  const restoreFocus = () => requestAnimationFrame(() => opener.current?.focus());

  function openSheet(id: string) {
    remember();
    setSelected(id);
  }
  function openHire(id: string) {
    if (!selected) remember();
    setHireFor(id);
  }
  function closeSheet() {
    setSelected(null);
    restoreFocus();
  }
  function closeHire() {
    setHireFor(null);
    if (!selected) restoreFocus();
  }
  function confirmHire(departmentId: DepartmentId) {
    if (!hireFor) return;
    hire(hireFor, departmentId);
    router.push("/oficina"); // La llegada del agente se anima en la tarjeta del departamento.
  }

  // Escape cierra primero el diálogo de contratación y después la ficha.
  useEffect(() => {
    if (!selected && !hireFor) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (hireFor) {
        setHireFor(null);
        if (!selected) requestAnimationFrame(() => opener.current?.focus());
      } else {
        setSelected(null);
        requestAnimationFrame(() => opener.current?.focus());
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, hireFor]);

  const sheetAgent = marketAgents.find((a) => a.id === selected);
  const hireAgent = marketAgents.find((a) => a.id === hireFor);

  return (
    <div className="flex flex-1 flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-h1">Marketplace</h1>
        <p className="text-body text-ink-2">Agentes certificados listos para unirse a tu oficina</p>
      </div>

      <div className="flex flex-wrap items-center gap-3" inert={selected !== null || hireFor !== null}>
        <GlassInput
          className="w-full sm:w-72"
          icon={Search}
          type="search"
          aria-label="Buscar agentes"
          placeholder="Buscar agentes"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div role="group" aria-label="Filtrar por categoría" className="flex flex-wrap gap-2">
          <PillButton active={category === "all"} onClick={() => setCategory("all")}>
            Todos
          </PillButton>
          {marketCategories.map((c) => (
            <PillButton key={c} active={category === c} onClick={() => setCategory(c)}>
              {c}
            </PillButton>
          ))}
        </div>
      </div>

      <div inert={selected !== null || hireFor !== null}>
        {visible.length === 0 && <p className="text-body text-ink-2">No hay agentes que coincidan con tu búsqueda.</p>}
        <h2 className="sr-only">Agentes certificados</h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <AnimatePresence>
            {visible.map((a, i) => (
              <MarketCard
                key={a.id}
                agent={a}
                hired={isHired(a.id)}
                delay={0.05 + i * 0.05}
                onOpen={() => openSheet(a.id)}
                onHire={() => openHire(a.id)}
              />
            ))}
          </AnimatePresence>
        </div>
      </div>

      <AnimatePresence>
        {sheetAgent && (
          <AgentSheet
            key={sheetAgent.id}
            agent={sheetAgent}
            hired={isHired(sheetAgent.id)}
            trap={!hireFor}
            onHire={() => openHire(sheetAgent.id)}
            onClose={closeSheet}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {hireAgent && (
          <HireDialog
            key={hireAgent.id}
            agent={hireAgent}
            summaries={summaries}
            onConfirm={confirmHire}
            onClose={closeHire}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
