"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { useOfficeSimulation } from "@/lib/useOfficeSimulation";

type SimulationValue = ReturnType<typeof useOfficeSimulation> & {
  /** Cadena abierta en el diálogo, si la hay. */
  chainId: string | null;
  openChain: (chainId: string) => void;
  closeChain: () => void;
};

const SimulationContext = createContext<SimulationValue | null>(null);

/** Estado compartido (simulado) de los traspasos entre departamentos y de la cadena abierta. */
export function SimulationProvider({ children }: { children: ReactNode }) {
  const sim = useOfficeSimulation();
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

  const { events, latest, seen, paused, toggle } = sim;
  const value = useMemo(
    () => ({ events, latest, seen, paused, toggle, chainId, openChain, closeChain }),
    [events, latest, seen, paused, toggle, chainId, openChain, closeChain],
  );
  return <SimulationContext.Provider value={value}>{children}</SimulationContext.Provider>;
}

export function useSimulation() {
  const ctx = useContext(SimulationContext);
  if (!ctx) throw new Error("useSimulation debe usarse dentro de SimulationProvider");
  return ctx;
}
