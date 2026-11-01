import type { AgentStatus, DepartmentId } from "@/components/glass";

export type Agent = {
  id: string;
  name: string;
  /** Puesto. */
  role: string;
  departmentId: DepartmentId;
  status: AgentStatus;
  /** Continúa la frase «<nombre> está …». */
  task: string;
  tools: string[];
  creator: string;
  pendingApprovals: number;
  creditsToday: number;
};

export const agents: Agent[] = [
  {
    id: "lucia-ramos",
    name: "Lucía Ramos",
    role: "Seguimiento comercial",
    departmentId: "ventas",
    status: "working",
    task: "enviando seguimientos a 14 leads",
    tools: ["Gmail", "HubSpot", "Calendly"],
    creator: "Estudio Cálamo",
    pendingApprovals: 0,
    creditsToday: 46,
  },
  {
    id: "daniel-prieto",
    name: "Daniel Prieto",
    role: "Cualificación de leads",
    departmentId: "ventas",
    status: "working",
    task: "puntuando 23 contactos nuevos del formulario web",
    tools: ["HubSpot", "LinkedIn", "Google Sheets"],
    creator: "Leadforge",
    pendingApprovals: 0,
    creditsToday: 38,
  },
  {
    id: "irene-soler",
    name: "Irene Soler",
    role: "Propuestas comerciales",
    departmentId: "ventas",
    status: "waiting",
    task: "esperando tu aprobación para enviar una propuesta de 4.200 €",
    tools: ["Google Docs", "HubSpot", "Stripe"],
    creator: "Estudio Cálamo",
    pendingApprovals: 1,
    creditsToday: 29,
  },
  {
    id: "sofia-navarro",
    name: "Sofía Navarro",
    role: "Atención por chat",
    departmentId: "atencion",
    status: "working",
    task: "respondiendo 9 conversaciones abiertas en el chat web",
    tools: ["Intercom", "Notion", "Slack"],
    creator: "Helpdesk Labs",
    pendingApprovals: 0,
    creditsToday: 61,
  },
  {
    id: "hugo-lara",
    name: "Hugo Lara",
    role: "Atención por correo",
    departmentId: "atencion",
    status: "working",
    task: "clasificando 31 correos del buzón de soporte",
    tools: ["Gmail", "Zendesk"],
    creator: "Helpdesk Labs",
    pendingApprovals: 0,
    creditsToday: 33,
  },
  {
    id: "carla-medina",
    name: "Carla Medina",
    role: "Redactora de contenidos",
    departmentId: "marketing",
    status: "working",
    task: "redactando el boletín de noviembre",
    tools: ["Notion", "Mailchimp", "Canva"],
    creator: "Verbo Studio",
    pendingApprovals: 0,
    creditsToday: 52,
  },
  {
    id: "alvaro-rios",
    name: "Álvaro Ríos",
    role: "Gestor de campañas",
    departmentId: "marketing",
    status: "waiting",
    task: "esperando tu aprobación para 2 anuncios de la campaña de otoño",
    tools: ["Meta Ads", "Google Ads", "Google Analytics"],
    creator: "Verbo Studio",
    pendingApprovals: 2,
    creditsToday: 44,
  },
  {
    id: "nuria-campos",
    name: "Nuria Campos",
    role: "Actualización de CRM",
    departmentId: "operaciones",
    status: "working",
    task: "actualizando 120 fichas de clientes en el CRM",
    tools: ["HubSpot", "Google Sheets", "Zapier"],
    creator: "Flujo Ops",
    pendingApprovals: 0,
    creditsToday: 27,
  },
  {
    id: "tomas-vidal",
    name: "Tomás Vidal",
    role: "Facturación",
    departmentId: "operaciones",
    status: "working",
    task: "emitiendo 6 facturas del cierre de mes",
    tools: ["Stripe", "Holded", "Gmail"],
    creator: "Flujo Ops",
    pendingApprovals: 0,
    creditsToday: 35,
  },
  {
    id: "elena-bravo",
    name: "Elena Bravo",
    role: "Analista de dirección",
    departmentId: "direccion",
    status: "working",
    task: "preparando el informe semanal de ventas y gasto",
    tools: ["Google Analytics", "Google Sheets", "Slack"],
    creator: "Atalaya Analytics",
    pendingApprovals: 0,
    creditsToday: 18,
  },
];
