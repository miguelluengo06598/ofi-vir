"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Mail, Pause, Play, Radio, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useApprovals } from "@/components/ApprovalsProvider";
import { GlassPanel, PillButton } from "@/components/glass";
import { useInbox } from "@/components/InboxProvider";
import { useSimulation } from "@/components/SimulationProvider";
import { firstName } from "@/data/agents";
import { contactDirectory } from "@/data/emails";
import { kindLabel } from "@/data/handoffs";
import { HandoffPair, HandoffStatusText, useAgenteDe } from "./parts";

const SHOWN = 5;
const ANNOUNCE_EVERY_MS = 10_000;

/** Panel «En directo»: los últimos traspasos. En móvil se despliega desde un botón sobre el dock. */
export function LivePanel() {
  const { events, latest, paused, toggle, openChain, cadena } = useSimulation();
  const agenteDe = useAgenteDe();
  const { messages, fresh } = useInbox();
  const { openContact, modoReal } = useApprovals();
  const [open, setOpen] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const lastAnnounced = useRef(0);

  // Región aria-live: como mucho un anuncio cada 10 s.
  useEffect(() => {
    if (!latest) return;
    const now = Date.now();
    if (now - lastAnnounced.current < ANNOUNCE_EVERY_MS) return;
    lastAnnounced.current = now;
    const { handoff: h } = latest;
    setAnnouncement(`Traspaso de ${firstName(agenteDe(h.fromAgentId).name)} a ${firstName(agenteDe(h.toAgentId).name)}: ${h.summary}`);
  }, [latest, agenteDe]);

  // Correo real recibido: se anuncia como mucho cada 10 s, igual que los traspasos.
  const newest = messages[0];
  useEffect(() => {
    if (!newest || !fresh.has(newest.emailId)) return;
    const now = Date.now();
    if (now - lastAnnounced.current < ANNOUNCE_EVERY_MS) return;
    lastAnnounced.current = now;
    setAnnouncement(`Correo recibido de ${newest.contactName}: ${newest.threadSubject}`);
  }, [newest, fresh]);

  const recent = events.slice(-SHOWN).reverse();
  const mails = messages.slice(0, 3);
  // En la oficina real no hay agenda de ejemplo: el correo se muestra sin abrir una ficha inventada.
  const directoryId = (email: string) =>
    modoReal ? undefined : Object.entries(contactDirectory).find(([, c]) => c.email.toLowerCase() === email.toLowerCase())?.[0];

  return (
    <>
      <div role="status" aria-live="polite" className="sr-only">
        {announcement}
      </div>

      <div className="fixed right-4 bottom-24 z-30 md:hidden">
        <PillButton icon={open ? X : Radio} active={open} aria-pressed={undefined} aria-expanded={open} aria-controls="en-directo" onClick={() => setOpen((o) => !o)}>
          En directo
        </PillButton>
      </div>

      <GlassPanel
        as="section"
        id="en-directo"
        aria-label="En directo"
        className={`fixed right-4 bottom-40 left-4 z-30 flex-col gap-1 p-3 md:right-6 md:bottom-6 md:left-auto md:flex md:w-[22rem] ${open ? "flex" : "hidden"}`}
      >
        <div className="flex items-center justify-between gap-2 px-2 py-1">
          <h2 className="flex items-center gap-2 text-small font-semibold">
            <span aria-hidden="true" className={`size-2 rounded-full ${paused ? "bg-status-paused" : "animate-pulse bg-status-working"}`} />
            {paused ? "En directo · en pausa" : "En directo"}
          </h2>
          <PillButton icon={paused ? Play : Pause} compact aria-label={paused ? "Reanudar la simulación" : "Pausar la simulación"} onClick={toggle} />
        </div>
        {mails.length > 0 && (
          <ul aria-label="Correos recibidos" className="flex flex-col border-b border-glass-border pb-1">
            {mails.map((m) => {
              const id = directoryId(m.contactEmail);
              const body = (
                <>
                  <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-full bg-accent/40">
                    <Mail size={16} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-1 block text-tiny leading-snug font-semibold">
                      Correo de {m.contactName}
                      {fresh.has(m.emailId) && <span className="ml-2 rounded-pill bg-accent/40 px-1.5 py-0.5 font-normal">Nuevo</span>}
                    </span>
                    <span className="line-clamp-2 block text-tiny leading-snug text-ink-2">{m.threadSubject}</span>
                    <time dateTime={m.receivedAt} className="text-tiny text-ink-3">
                      {new Date(m.receivedAt).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}
                    </time>
                  </span>
                </>
              );
              return (
                <li key={m.emailId}>
                  {id ? (
                    <button type="button" aria-label={`Abrir los correos de ${m.contactName}: ${m.threadSubject}`} onClick={() => openContact(id)} className="flex w-full cursor-pointer items-center gap-3 rounded-card px-2 py-2 text-left transition-colors hover:bg-white/10">
                      {body}
                    </button>
                  ) : (
                    <div className="flex w-full items-center gap-3 px-2 py-2">{body}</div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <ul className="flex flex-col">
          <AnimatePresence initial={false}>
            {recent.map((e) => (
              <motion.li
                key={e.seq}
                layout="position"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.25 }}
                className="overflow-hidden"
              >
                <button
                  type="button"
                  aria-label={`Abrir la cadena: ${e.handoff.summary}`}
                  onClick={() => openChain(e.handoff.chainId)}
                  className="flex w-full cursor-pointer items-center gap-3 rounded-card px-2 py-2 text-left transition-colors hover:bg-white/10"
                >
                  <HandoffPair handoff={e.handoff} />
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-2 block text-tiny leading-snug">
                      <span className="text-ink-3">{kindLabel[e.handoff.kind]} · </span>
                      {e.handoff.summary}
                    </span>
                    <span className="block text-tiny text-ink-3">Empezó por: {cadena(e.handoff.chainId)?.origen ?? "—"}</span>
                    <span className="mt-0.5 flex items-center gap-2">
                      <span className="text-tiny text-ink-3">{e.time}</span>
                      <HandoffStatusText status={e.status} />
                    </span>
                  </span>
                </button>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      </GlassPanel>
    </>
  );
}
