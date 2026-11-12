"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import type { DepartmentId } from "@/components/glass/tokens";
import { chainById, connectedPairs, type Chain } from "@/data/handoffs";
import { useOfficeSimulation } from "@/lib/useOfficeSimulation";
import { useTraspasosReales } from "@/lib/useTraspasosReales";

type SimulationValue = ReturnType<typeof useOfficeSimulation> & {
  /** Cadena por su id (real o de ejemplo, según el modo). */
  cadena: (id: string) => Chain | null;
  /** Pares de departamentos que se comunican, para las líneas en reposo. */
  pares: () => [DepartmentId, DepartmentId][];
  /** Cadena abierta en el diálogo, si la hay. */
  chainId: string | null;
  openChain: (chainId: string) => void;
  closeChain: () => void;
};

const SimulationContext = createContext<SimulationValue | null>(null);

/**
 * Traspasos entre departamentos y cadena abierta. Con `real` (la oficina de una empresa) son los traspasos de verdad de la
 * empresa; sin él (demos de la web pública, con «datos de ejemplo») se reproduce la simulación.
 */
export function SimulationProvider({ children, real = false }: { children: ReactNode; real?: boolean }) {
  return real ? <ConFuente useFuente={useTraspasosReales}>{children}</ConFuente> : <ConFuente useFuente={useSimulada}>{children}</ConFuente>;
}

function useSimulada() {
  const sim = useOfficeSimulation();
  const cadena = useCallback((id: string) => chainById(id) ?? null, []);
  return { ...sim, cadena, pares: connectedPairs };
}

function ConFuente({ children, useFuente }: { children: ReactNode; useFuente: () => Omit<SimulationValue, "chainId" | "openChain" | "closeChain"> }) {
  const sim = useFuente();
  const [chainId, setChainId] = useState<string | null>(null);
  const opener = useRef<HTMLElement | null>(null);

  const openChain = useCallback((id: string) => {
    opener.current = document.activeElement as HTMLElement | null;
    setChainId(id);
  }, []);
  const closeChain = useCallback(() => {
    setChainId(null);
    requestAnimationFrame(() => opener.current?.focus());
  }, []);

  const { events, latest, seen, paused, toggle, cadena, pares } = sim;
  const value = useMemo(
    () => ({ events, latest, seen, paused, toggle, cadena, pares, chainId, openChain, closeChain }),
    [events, latest, seen, paused, toggle, cadena, pares, chainId, openChain, closeChain],
  );
  return <SimulationContext.Provider value={value}>{children}</SimulationContext.Provider>;
}

export function useSimulation() {
  const ctx = useContext(SimulationContext);
  if (!ctx) throw new Error("useSimulation debe usarse dentro de SimulationProvider");
  return ctx;
}
