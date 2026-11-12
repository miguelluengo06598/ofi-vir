"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { DepartmentId } from "@/components/glass/tokens";
import type { Chain, Handoff, HandoffStatus } from "@/data/handoffs";
import type { LiveEvent } from "./useOfficeSimulation";

const CADA_MS = 15_000;
const GUARDAR = 20;

type HandoffApi = Handoff & { fromAgentName?: string; toAgentName?: string; time: string };
type CadenaApi = Omit<Chain, "handoffs"> & { handoffs: HandoffApi[] };

const hora = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
};

/**
 * «En directo» con los traspasos REALES de la empresa (`GET /api/traspasos`), con la misma forma que la simulación de
 * las demos. Lo que ya había al abrir la oficina es historial (no se anima); lo que llega después se anima como nuevo.
 * Pausar deja de consultar. Nunca inventa traspasos: sin datos, la lista está vacía.
 */
export function useTraspasosReales() {
  const [cadenas, setCadenas] = useState<Map<string, Chain>>(new Map());
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const [seen, setSeen] = useState<ReadonlySet<string>>(new Set());
  const [paused, setPaused] = useState(false);
  const conocidos = useRef<Map<string, HandoffStatus>>(new Map());
  const primera = useRef(true);
  const seq = useRef(0);

  useEffect(() => {
    if (paused) return;
    let vivo = true;
    const cargar = async () => {
      try {
        const r = await fetch("/api/traspasos?limite=20", { cache: "no-store" });
        if (!r.ok || !vivo) return;
        const { cadenas: lista } = (await r.json()) as { cadenas: CadenaApi[] };
        const mapa = new Map<string, Chain>();
        const nuevos: LiveEvent[] = [];
        for (const c of lista) {
          const handoffs = c.handoffs.map((h) => ({ ...h, time: hora(h.time), fromDepartmentId: h.fromDepartmentId as DepartmentId, toDepartmentId: h.toDepartmentId as DepartmentId }));
          mapa.set(c.id, { ...c, handoffs });
          for (const h of handoffs) {
            const antes = conocidos.current.get(h.id);
            if (antes === h.status) continue;
            conocidos.current.set(h.id, h.status);
            if (antes === undefined) nuevos.push({ seq: ++seq.current, handoff: h, status: h.status, time: h.time, seed: primera.current });
          }
        }
        primera.current = false;
        setCadenas(mapa);
        if (nuevos.length) {
          nuevos.sort((a, b) => a.handoff.time.localeCompare(b.handoff.time));
          setEvents((e) => [...e, ...nuevos].slice(-GUARDAR));
          setSeen((s) => new Set([...s, ...nuevos.map((n) => n.handoff.id)]));
        }
        // Los estados cambian (en curso → completado): se actualizan en la lista.
        setEvents((e) => e.map((ev) => {
          const actual = conocidos.current.get(ev.handoff.id);
          return actual && actual !== ev.status ? { ...ev, status: actual } : ev;
        }));
      } catch { /* sin conexión: se reintenta en la siguiente vuelta */ }
    };
    void cargar();
    const t = setInterval(() => void cargar(), CADA_MS);
    return () => { vivo = false; clearInterval(t); };
  }, [paused]);

  const toggle = useCallback(() => setPaused((p) => !p), []);
  const cadena = useCallback((id: string) => cadenas.get(id) ?? null, [cadenas]);
  const pares = useCallback((): [DepartmentId, DepartmentId][] => {
    const vistos = new Map<string, [DepartmentId, DepartmentId]>();
    for (const c of cadenas.values()) for (const h of c.handoffs) {
      if (h.fromDepartmentId === h.toDepartmentId) continue;
      const par = [h.fromDepartmentId, h.toDepartmentId].sort() as [DepartmentId, DepartmentId];
      vistos.set(par.join("|"), par);
    }
    return [...vistos.values()];
  }, [cadenas]);

  return { events, latest: events.findLast((e) => !e.seed) ?? null, seen, paused, toggle, cadena, pares };
}
