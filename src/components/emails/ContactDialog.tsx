"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Mail, X } from "lucide-react";
import { useRef, useState } from "react";
import { useApprovals } from "@/components/ApprovalsProvider";
import { Avatar, MotionGlassPanel, PillButton } from "@/components/glass";
import { agentById } from "@/data/agents";
import { contactDirectory, emailThreads } from "@/data/emails";
import { useFocusTrap } from "@/lib/useFocusTrap";
import { EmailThreads } from "./EmailThreads";
import { Tabs, tabId } from "./parts";

/** Ficha de contacto abierta desde Mensajes (la de Memoria vive en el panel de detalle). */
export function ContactDialog() {
  const { contactTarget, closeContact } = useApprovals();
  return <AnimatePresence>{contactTarget && <Dialog key={contactTarget} contactId={contactTarget} onClose={closeContact} />}</AnimatePresence>;
}

function Dialog({ contactId, onClose }: { contactId: string; onClose: () => void }) {
  const contact = contactDirectory[contactId];
  const dialog = useRef<HTMLElement>(null);
  const [tab, setTab] = useState<"ficha" | "correos">("correos");
  useFocusTrap(dialog);
  const agents = [...new Set(emailThreads.filter((t) => t.contactId === contactId).map((t) => t.agentId))].map(agentById);

  return (
    <>
      <motion.div
        aria-hidden="true"
        className="fixed inset-0 z-[60] bg-black/40"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      />
      <div
        className="pointer-events-none fixed inset-0 z-[70] flex items-center justify-center p-4 md:pl-24"
        onKeyDown={(e) => e.key === "Escape" && onClose()}
      >
        <MotionGlassPanel
          ref={dialog}
          role="dialog"
          aria-modal="true"
          aria-label={`Ficha de ${contact.name}`}
          style={{ borderRadius: 28 }}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 12 }}
          className="pointer-events-auto flex max-h-full w-full max-w-lg flex-col gap-4 overflow-y-auto p-6"
        >
          <div className="flex items-center gap-3">
            <Avatar name={contact.name} tone="direccion" size={48} />
            <div className="min-w-0 flex-1">
              <h2 className="text-h2">{contact.name}</h2>
              <p className="text-small text-ink-2">
                {contact.role} · {contact.company}
              </p>
            </div>
            <PillButton icon={X} aria-label="Cerrar" autoFocus onClick={onClose} />
          </div>

          <Tabs
            prefix="contact"
            label="Secciones de la ficha"
            value={tab}
            onChange={setTab}
            tabs={[
              { value: "ficha", label: "Ficha" },
              { value: "correos", label: "Correos", icon: <Mail size={14} aria-hidden="true" /> },
            ]}
          />

          <div role="tabpanel" aria-labelledby={tabId("contact", tab)} className="flex flex-col gap-3">
            {tab === "correos" ? (
              <EmailThreads contactId={contactId} />
            ) : (
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-small">
                <dt className="text-ink-2">Correo</dt>
                <dd>{contact.email}</dd>
                <dt className="text-ink-2">Empresa</dt>
                <dd>{contact.company}</dd>
                <dt className="text-ink-2">Atendido por</dt>
                <dd>{agents.map((a) => a.name).join(", ")}</dd>
              </dl>
            )}
          </div>
        </MotionGlassPanel>
      </div>
    </>
  );
}
