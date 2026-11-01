"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { allHandoffs, type Handoff, type HandoffStatus } from "@/data/handoffs";

/** Traspaso ya reproducido. `seed`: viene del historial inicial y no se anima. */
export type LiveEvent = { seq: number; handoff: Handoff; status: HandoffStatus; time: string; seed: boolean };

const MIN_MS = 6000;
const MAX_MS = 10000;
/** Tiempo que un traspaso se muestra como «enviado» antes de pasar a su estado. */
const SETTLE_MS = 2500;
const SEED = 3;
const KEEP = 20;

const clock = () => new Date().toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
const initialEvents = (): LiveEvent[] =>
  allHandoffs.slice(0, SEED).map((handoff, i) => ({ seq: i + 1, handoff, status: handoff.status, time: handoff.time, seed: true }));

/** Reproduce los traspasos uno a uno cada 6-10 s, en bucle. Se puede pausar y reanudar. */
export function useOfficeSimulation() {
  const [events, setEvents] = useState<LiveEvent[]>(initialEvents);
  const [seen, setSeen] = useState<ReadonlySet<string>>(() => new Set(allHandoffs.slice(0, SEED).map((h) => h.id)));
  const [paused, setPaused] = useState(false);
  const cursor = useRef(SEED);
  const seq = useRef(SEED);
  const timers = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, []);

  useEffect(() => {
    if (paused) return;
    let timer: ReturnType<typeof setTimeout>;

    const emit = () => {
      const handoff = allHandoffs[cursor.current % allHandoffs.length];
      cursor.current += 1;
      seq.current += 1;
      const n = seq.current;
      setEvents((list) => [...list, { seq: n, handoff, status: "sent" as HandoffStatus, time: clock(), seed: false }].slice(-KEEP));
      setSeen((s) => new Set(s).add(handoff.id));
      const settle = setTimeout(() => {
        timers.current.delete(settle);
        setEvents((list) => list.map((e) => (e.seq === n ? { ...e, status: handoff.status } : e)));
      }, SETTLE_MS);
      timers.current.add(settle);
    };

    const schedule = (ms: number) => {
      timer = setTimeout(() => {
        emit();
        schedule(MIN_MS + Math.random() * (MAX_MS - MIN_MS));
      }, ms);
    };
    schedule(2000);
    return () => clearTimeout(timer);
  }, [paused]);

  const toggle = useCallback(() => setPaused((p) => !p), []);

  return {
    events,
    /** Último traspaso reproducido en directo (no del historial inicial). */
    latest: events.findLast((e) => !e.seed) ?? null,
    /** Ids de los traspasos ya reproducidos. */
    seen,
    paused,
    toggle,
  };
}
