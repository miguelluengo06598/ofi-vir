"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import type { DepartmentId } from "@/components/glass";
import { aprobarCorreo } from "@/app/actions/aprobarCorreo";
import { approvals } from "@/data/approvals";
import { buildOffice, hiredAgentId, type HiredAgent } from "@/data/departments";
import type { EmailEdit } from "@/data/emails";
import { expertFor, initialConsultations, type Consultation } from "@/data/experts";
import { initialConversations, touchConversation, type Conversation } from "@/data/messages";

export type Decision = { approvalId: string; decision: "approved" | "rejected" };

type OfficeState = ReturnType<typeof buildOffice>;

type ApprovalsContextValue = {
  decisions: Decision[];
  /** Ids de aprobaciones ya resueltas. */
  resolved: ReadonlySet<string>;
  /** Textos editados por el usuario, por id de aprobación. */
  edits: Record<string, string>;
  /** Asunto y cuerpo editados de los borradores de correo, por id de aprobación. */
  emailEdits: Record<string, EmailEdit>;
  editEmail: (approvalId: string, edit: EmailEdit) => void;
  /** Contacto cuya ficha (con la pestaña Correos) está abierta desde Mensajes. */
  contactTarget: string | null;
  openContact: (contactId: string) => void;
  closeContact: () => void;
  pendingCount: number;
  /** Estado de la oficina con aprobaciones, contrataciones y consultas aplicadas. */
  office: OfficeState;
  /** Agentes del marketplace contratados. */
  hired: HiredAgent[];
  /** Id del agente recién contratado cuya llegada a la oficina aún se está animando. */
  arrival: string | null;
  hire: (marketId: string, departmentId: DepartmentId) => void;
  finishArrival: () => void;
  decide: (approvalId: string, decision: Decision["decision"]) => void;
  /** Borradores de correo que se están aprobando y enviando ahora mismo. */
  sending: ReadonlySet<string>;
  /** Motivo por el que un correo no se pudo enviar (sigue pendiente), por id de aprobación. */
  sendErrors: Record<string, string>;
  /** Aprueba un borrador de correo y lo envía de verdad (con el texto editado, si lo hay). */
  approveEmail: (approvalId: string) => Promise<void>;
  edit: (approvalId: string, body: string) => void;
  /** Conversaciones de Mensajes (compartidas para que las consultas añadan avisos del sistema). */
  conversations: Conversation[];
  setConversations: Dispatch<SetStateAction<Conversation[]>>;
  consultations: Consultation[];
  /** Agente cuyo diálogo «Consultar al experto» está abierto. */
  consultTarget: string | null;
  openConsult: (agentId: string) => void;
  closeConsult: () => void;
  consult: (agentId: string, problem: string) => void;
};

const ApprovalsContext = createContext<ApprovalsContextValue | null>(null);

/** Estado compartido (simulado) de la oficina: aprobaciones, contrataciones, créditos, mensajes y consultas al experto. */
export function ApprovalsProvider({ children }: { children: ReactNode }) {
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [emailEdits, setEmailEdits] = useState<Record<string, EmailEdit>>({});
  const [sending, setSending] = useState<ReadonlySet<string>>(new Set());
  const [sendErrors, setSendErrors] = useState<Record<string, string>>({});
  const [contactTarget, setContactTarget] = useState<string | null>(null);
  const [hired, setHired] = useState<HiredAgent[]>([]);
  const [arrival, setArrival] = useState<string | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>(initialConversations);
  const [consultations, setConsultations] = useState<Consultation[]>(initialConsultations);
  const [consultTarget, setConsultTarget] = useState<string | null>(null);

  const resolved = useMemo(() => new Set(decisions.map((d) => d.approvalId)), [decisions]);
  const office = useMemo(() => buildOffice(resolved, hired, consultations), [resolved, hired, consultations]);

  const decide = useCallback(
    (approvalId: string, decision: Decision["decision"]) =>
      setDecisions((d) => (d.some((x) => x.approvalId === approvalId) ? d : [...d, { approvalId, decision }])),
    [],
  );
  const approveEmail = useCallback(
    async (approvalId: string) => {
      const a = approvals.find((x) => x.id === approvalId);
      if (!a?.email) return decide(approvalId, "approved");
      if (sending.has(approvalId)) return;
      setSending((s) => new Set(s).add(approvalId));
      setSendErrors((all) => {
        const rest = { ...all };
        delete rest[approvalId];
        return rest;
      });
      const edited = emailEdits[approvalId];
      try {
        const r = await aprobarCorreo({
          agentSlug: a.agentId,
          toEmail: a.email.toEmail,
          subject: edited?.subject ?? a.email.subject,
          body: edited?.body ?? a.email.body,
        });
        // Sin backend configurado la interfaz sigue en modo simulado; con backend, solo se resuelve si salió el correo.
        if (r.estado === "enviado" || r.estado === "sin_backend") decide(approvalId, "approved");
        else setSendErrors((e) => ({ ...e, [approvalId]: r.mensaje }));
      } catch {
        setSendErrors((e) => ({ ...e, [approvalId]: "No se pudo contactar con el servidor. El correo no se ha enviado." }));
      } finally {
        setSending((s) => {
          const next = new Set(s);
          next.delete(approvalId);
          return next;
        });
      }
    },
    [decide, emailEdits, sending],
  );
  const edit = useCallback(
    (approvalId: string, body: string) => setEdits((e) => ({ ...e, [approvalId]: body })),
    [],
  );
  const editEmail = useCallback((approvalId: string, e: EmailEdit) => setEmailEdits((all) => ({ ...all, [approvalId]: e })), []);
  const openContact = useCallback((id: string) => setContactTarget(id), []);
  const closeContact = useCallback(() => setContactTarget(null), []);
  const hire = useCallback((marketId: string, departmentId: DepartmentId) => {
    setHired((h) => (h.some((x) => x.marketId === marketId) ? h : [...h, { marketId, departmentId }]));
    setArrival(hiredAgentId(marketId));
  }, []);
  const finishArrival = useCallback(() => setArrival(null), []);

  const openConsult = useCallback((agentId: string) => setConsultTarget(agentId), []);
  const closeConsult = useCallback(() => setConsultTarget(null), []);
  const consult = useCallback(
    (agentId: string, problem: string) => {
      const agent = office.summaries.flatMap((s) => s.agents).find((a) => a.id === agentId);
      const expert = agent && expertFor(agent.creator);
      if (!agent || !expert || consultations.some((c) => c.agentId === agentId)) return;

      const id = `consulta-${agentId}-${consultations.length}`;
      setConsultations((c) => [
        ...c,
        { id, agentId, origin: "company", problem, price: expert.price, estimatedHours: expert.avgResponseHours },
      ]);
      const time = new Date().toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
      setConversations((cs) =>
        touchConversation(cs, agentId, (c) => ({
          ...c,
          messages: [
            ...c.messages,
            {
              id: `sys-${id}`,
              from: "system",
              day: "Hoy",
              time,
              text: `Has consultado a ${expert.name}, ${expert.title} de ${agent.name.split(" ")[0]}. Respuesta estimada: ${expert.avgResponseHours} h`,
            },
          ],
        })),
      );
    },
    [office, consultations],
  );

  const value = useMemo(
    () => ({
      decisions,
      resolved,
      edits,
      emailEdits,
      editEmail,
      contactTarget,
      openContact,
      closeContact,
      pendingCount: approvals.filter((a) => !resolved.has(a.id)).length,
      office,
      hired,
      arrival,
      hire,
      finishArrival,
      decide,
      sending,
      sendErrors,
      approveEmail,
      edit,
      conversations,
      setConversations,
      consultations,
      consultTarget,
      openConsult,
      closeConsult,
      consult,
    }),
    [
      decisions, resolved, edits, emailEdits, editEmail, contactTarget, openContact, closeContact, office, hired, arrival, hire,
      finishArrival, decide, sending, sendErrors, approveEmail, edit, conversations, consultations, consultTarget, openConsult, closeConsult, consult,
    ],
  );

  return <ApprovalsContext.Provider value={value}>{children}</ApprovalsContext.Provider>;
}

export function useApprovals() {
  const ctx = useContext(ApprovalsContext);
  if (!ctx) throw new Error("useApprovals debe usarse dentro de ApprovalsProvider");
  return ctx;
}
