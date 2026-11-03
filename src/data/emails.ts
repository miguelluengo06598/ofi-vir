import { CheckCheck, Clock, Reply, Send, TriangleAlert, type LucideIcon } from "lucide-react";
import { approvals, type EmailAttachment } from "./approvals";

export type EmailStatus = "pending" | "sent" | "delivered" | "bounced" | "replied";

/** Estado de entrega: siempre texto + icono, nunca solo color. */
export const emailStatusMeta: Record<EmailStatus, { label: string; icon: LucideIcon; tone: string }> = {
  pending: { label: "Pendiente de aprobación", icon: Clock, tone: "text-status-waiting" },
  sent: { label: "Enviado", icon: Send, tone: "text-white" },
  delivered: { label: "Entregado", icon: CheckCheck, tone: "text-status-working" },
  bounced: { label: "Rebotado", icon: TriangleAlert, tone: "text-status-error" },
  replied: { label: "Respondido", icon: Reply, tone: "text-accent" },
};

export type EmailMessage = {
  id: string;
  /** `agent`: lo envía el agente (a la derecha); `contact`: respuesta del cliente (a la izquierda). */
  from: "agent" | "contact";
  at: string;
  body: string;
  attachments?: EmailAttachment[];
};

export type EmailThread = {
  id: string;
  /** Cliente de la memoria (id de `memoryClients`). */
  contactId: string;
  /** Agente que lleva el hilo. */
  agentId: string;
  subject: string;
  status: EmailStatus;
  /** Aviso bajo el estado (p. ej. el motivo de un rebote). */
  statusNote?: string;
  messages: EmailMessage[];
  /** Hilo cuyo último correo es un borrador pendiente en Aprobaciones: se toma de allí (y de sus ediciones). */
  approvalId?: string;
  /** Hora del borrador. */
  draftAt?: string;
};

export type Contact = { name: string; email: string; company: string; role: string };

export const contactDirectory: Record<string, Contact> = {
  laura: { name: "Laura Gómez", email: "laura@clinicasol.example", company: "Clínica Sol", role: "Directora" },
  javier: { name: "Javier Ortega", email: "javier@reformasortega.example", company: "Reformas Ortega", role: "Gerente" },
  marta: { name: "Marta Ibáñez", email: "marta@ibanezasociados.example", company: "Ibáñez & Asociados", role: "Socia" },
};

const pdf = (name: string, size: string): EmailAttachment => ({ name, kind: "pdf", size });

export const emailThreads: EmailThread[] = [
  // Laura Gómez · Clínica Sol
  {
    id: "t-laura-propuesta",
    contactId: "laura",
    agentId: "irene-soler",
    subject: "",
    status: "pending",
    messages: [],
    approvalId: "apr-propuesta-clinica-sol",
    draftAt: "2026-11-03T10:15:00",
  },
  {
    id: "t-laura-seguimiento",
    contactId: "laura",
    agentId: "lucia-ramos",
    subject: "Seguimiento del plan anual de gestión de citas",
    status: "replied",
    messages: [
      {
        id: "m1",
        from: "agent",
        at: "2026-10-24T10:05:00",
        body: "Hola, Laura:\n\nTe escribo para retomar tu solicitud del otro día. El plan anual de gestión de citas permite que tu clínica confirme y recuerde las citas por WhatsApp sin que nadie del equipo tenga que hacerlo a mano.\n\nTe adjunto un resumen de una página. ¿Te va bien una llamada de 15 minutos esta semana, mejor por la tarde?\n\nUn saludo,\nLucía Ramos · Ventas",
        attachments: [pdf("Resumen-plan-anual.pdf", "186 KB")],
      },
      {
        id: "m2",
        from: "contact",
        at: "2026-10-27T16:40:00",
        body: "Hola, Lucía:\n\nGracias por el resumen. Nos interesa, pero el precio nos parece alto comparado con la oferta que ya tenemos sobre la mesa. ¿Hay margen?\n\nLaura",
      },
    ],
  },
  {
    id: "t-laura-solicitud",
    contactId: "laura",
    agentId: "lucia-ramos",
    subject: "Hemos recibido tu solicitud de información",
    status: "delivered",
    messages: [
      {
        id: "m1",
        from: "agent",
        at: "2026-10-21T09:40:00",
        body: "Hola, Laura:\n\nHemos recibido tu solicitud desde el anuncio de clínicas dentales. En breve te escribiremos para contarte cómo podemos ayudar a Clínica Sol con la gestión de citas.\n\nUn saludo,\nLucía Ramos · Ventas",
      },
    ],
  },

  // Javier Ortega · Reformas Ortega
  {
    id: "t-javier-iva",
    contactId: "javier",
    agentId: "hugo-lara",
    subject: "",
    status: "pending",
    messages: [
      {
        id: "m1",
        from: "contact",
        at: "2026-10-30T17:20:00",
        body: "Buenas tardes:\n\n¿El precio de 2.800 € incluye el IVA? Y ¿podemos pagar por transferencia a 30 días como hablamos?\n\nJavier Ortega",
      },
    ],
    approvalId: "apr-iva-ortega",
    draftAt: "2026-11-03T10:40:00",
  },
  {
    id: "t-javier-factura",
    contactId: "javier",
    agentId: "tomas-vidal",
    subject: "Factura del plan trimestral (2.800 €)",
    status: "bounced",
    statusNote: "El servidor de destino rechazó el correo: el buzón está lleno. Tomás lo reintentará mañana.",
    messages: [
      {
        id: "m1",
        from: "agent",
        at: "2026-10-31T12:30:00",
        body: "Hola, Javier:\n\nAdjunto la factura del plan trimestral contratado el 28 de octubre. El pago se hace por transferencia a 30 días desde la fecha de factura.\n\nUn saludo,\nTomás Vidal · Operaciones",
        attachments: [pdf("Factura-2026-0214.pdf", "98 KB")],
      },
    ],
  },
  {
    id: "t-javier-propuesta",
    contactId: "javier",
    agentId: "irene-soler",
    subject: "Propuesta del plan trimestral para Reformas Ortega",
    status: "replied",
    messages: [
      {
        id: "m1",
        from: "agent",
        at: "2026-10-16T09:30:00",
        body: "Hola, Javier:\n\nGracias por suscribirte al boletín y por tu interés. Te adjunto la propuesta del plan trimestral (2.800 €) con el calendario de pagos y lo que incluye cada mes.\n\nUn saludo,\nIrene Soler · Ventas",
        attachments: [pdf("Propuesta-Reformas-Ortega.pdf", "354 KB"), { name: "Presupuesto-trimestral.xlsx", kind: "sheet", size: "41 KB" }],
      },
      {
        id: "m2",
        from: "contact",
        at: "2026-10-28T11:10:00",
        body: "Hola, Irene:\n\nLo hemos revisado y aceptamos la propuesta. Os devuelvo firmada la hoja de condiciones.\n\nUn saludo,\nJavier",
        attachments: [pdf("Condiciones-firmadas.pdf", "220 KB")],
      },
    ],
  },

  // Marta Ibáñez · Ibáñez & Asociados
  {
    id: "t-marta-rgpd",
    contactId: "marta",
    agentId: "sofia-navarro",
    subject: "",
    status: "pending",
    messages: [],
    approvalId: "apr-rgpd-ibanez",
    draftAt: "2026-11-03T10:50:00",
  },
  {
    id: "t-marta-demo",
    contactId: "marta",
    agentId: "lucia-ramos",
    subject: "Invitación a una demo de 20 minutos",
    status: "replied",
    messages: [
      {
        id: "m1",
        from: "agent",
        at: "2026-10-30T09:00:00",
        body: "Hola, Marta:\n\nTe propongo una demo de 20 minutos para enseñarte cómo atiende un agente las primeras consultas de tu despacho. Tengo libre el jueves a las 10:00, el viernes a las 12:30 o el lunes a las 16:00.\n\nUn saludo,\nLucía Ramos · Ventas",
      },
      {
        id: "m2",
        from: "contact",
        at: "2026-11-02T13:15:00",
        body: "Hola, Lucía:\n\nMe interesa, pero antes necesito saber cómo se protegen los datos de nuestros clientes y si se respeta el secreto profesional.\n\nMarta Ibáñez",
      },
    ],
  },
  {
    id: "t-marta-solicitud",
    contactId: "marta",
    agentId: "lucia-ramos",
    subject: "Hemos recibido tu solicitud de demo",
    status: "delivered",
    messages: [
      {
        id: "m1",
        from: "agent",
        at: "2026-10-29T15:45:00",
        body: "Hola, Marta:\n\nHemos recibido tu solicitud de demo para Ibáñez & Asociados. Te escribiremos pronto con varias opciones de horario.\n\nUn saludo,\nLucía Ramos · Ventas",
      },
    ],
  },
];

// ——— Estado derivado de Aprobaciones ———

export type EmailEdit = { subject: string; body: string };
type Decision = { approvalId: string; decision: "approved" | "rejected" };

export type ResolvedThread = Omit<EmailThread, "subject"> & {
  subject: string;
  lastAt: string;
  /** Primeras palabras del último correo, sin el saludo. */
  preview: string;
};

const previewOf = (body: string) =>
  body
    .replace(/^[^\n]*:\s*\n+/, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);

/** Hilos de un contacto, con los borradores tomados de Aprobaciones: siguen la edición y, si se aprueban, pasan a «Enviado». Los rechazados desaparecen. */
export function threadsFor(contactId: string, decisions: Decision[], edits: Record<string, EmailEdit>): ResolvedThread[] {
  const out: ResolvedThread[] = [];
  for (const t of emailThreads.filter((x) => x.contactId === contactId)) {
    if (!t.approvalId) {
      const last = t.messages[t.messages.length - 1];
      out.push({ ...t, lastAt: last.at, preview: previewOf(last.body) });
      continue;
    }
    const approval = approvals.find((a) => a.id === t.approvalId);
    const email = approval?.email;
    if (!email) continue;
    const decision = decisions.find((d) => d.approvalId === t.approvalId)?.decision;
    if (decision === "rejected") continue;
    const edit = edits[t.approvalId];
    const draft: EmailMessage = {
      id: `${t.id}-draft`,
      from: "agent",
      at: t.draftAt!,
      body: edit?.body ?? email.body,
      attachments: email.attachments,
    };
    out.push({
      ...t,
      subject: edit?.subject ?? email.subject,
      status: decision === "approved" ? "sent" : "pending",
      messages: [...t.messages, draft],
      lastAt: draft.at,
      preview: previewOf(draft.body),
    });
  }
  return out.sort((a, b) => b.lastAt.localeCompare(a.lastAt));
}

/** Contactos con los que un agente tiene hilos (para la ficha del agente). */
export const contactsOfAgent = (agentId: string) => [...new Set(emailThreads.filter((t) => t.agentId === agentId).map((t) => t.contactId))];

// ——— Límite diario ———

export const EMAIL_DAILY_LIMIT = 50;

/** Correos que cada agente ha enviado hoy antes de las aprobaciones de esta sesión. */
const emailsSentBase: Record<string, number> = {
  "lucia-ramos": 12,
  "irene-soler": 3,
  "hugo-lara": 21,
  "sofia-navarro": 8,
  "tomas-vidal": 6,
  "carla-medina": 2,
};

/** «Correos hoy»: los enviados + los borradores aprobados en esta sesión. */
export const emailsToday = (agentId: string, decisions: Decision[]) =>
  (emailsSentBase[agentId] ?? 0) +
  decisions.filter((d) => d.decision === "approved" && approvals.some((a) => a.id === d.approvalId && a.agentId === agentId && a.email)).length;
