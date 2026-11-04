"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { correosRecibidos } from "@/app/actions/correosRecibidos";
import type { LiveMessage } from "@/lib/email/inboundStore";

const POLL_MS = 8_000;

type InboxValue = {
  /** Correos recibidos por el webhook, del más reciente al más antiguo. Es contenido externo: se muestra solo como texto. */
  messages: LiveMessage[];
  /** Ids de los que han llegado mientras la oficina estaba abierta (los que ya existían al abrir no cuentan como novedad). */
  fresh: ReadonlySet<string>;
};

const InboxContext = createContext<InboxValue>({ messages: [], fresh: new Set() });

/** Consulta cada pocos segundos (con la pestaña visible) los correos recibidos y los comparte con En directo y Correos. */
export function InboxProvider({ children }: { children: ReactNode }) {
  const [messages, setMessages] = useState<LiveMessage[]>([]);
  const [fresh, setFresh] = useState<ReadonlySet<string>>(new Set());
  const known = useRef<Set<string> | null>(null);

  useEffect(() => {
    let stopped = false;
    const tick = async () => {
      if (document.visibilityState === "hidden") return;
      try {
        const list = await correosRecibidos();
        if (stopped) return;
        const first = known.current === null;
        const seen = known.current ?? new Set<string>();
        const novel = list.filter((m) => !seen.has(m.emailId)).map((m) => m.emailId);
        for (const id of novel) seen.add(id);
        known.current = seen;
        setMessages((prev) => (prev.length === list.length && prev.every((p, i) => p.emailId === list[i].emailId) ? prev : list));
        if (!first && novel.length > 0) setFresh((f) => new Set([...f, ...novel]));
      } catch {
        // Sin conexión con el servidor: se reintenta en el siguiente ciclo.
      }
    };
    void tick();
    const timer = setInterval(() => void tick(), POLL_MS);
    const onVisible = () => document.visibilityState === "visible" && void tick();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  const value = useMemo(() => ({ messages, fresh }), [messages, fresh]);
  return <InboxContext.Provider value={value}>{children}</InboxContext.Provider>;
}

export const useInbox = () => useContext(InboxContext);
