import type { DepartmentId } from "@/components/glass";

export type Approval = {
  id: string;
  agentId: string;
  departmentId: DepartmentId;
  title: string;
  detail: string;
};

export const approvals: Approval[] = [
  {
    id: "apr-propuesta-clinica-sol",
    agentId: "irene-soler",
    departmentId: "ventas",
    title: "Enviar propuesta a Clínica Dental Sol",
    detail: "Plan anual de gestión de citas · 4.200 € · válida 15 días",
  },
  {
    id: "apr-anuncio-otono",
    agentId: "alvaro-rios",
    departmentId: "marketing",
    title: "Publicar el anuncio «Otoño en casa» en Meta Ads",
    detail: "Presupuesto de 350 € durante 7 días · público: Madrid y Valencia",
  },
  {
    id: "apr-presupuesto-google",
    agentId: "alvaro-rios",
    departmentId: "marketing",
    title: "Ampliar un 20 % el presupuesto de Google Ads",
    detail: "De 1.500 € a 1.800 € al mes · la campaña supera su objetivo de clics",
  },
];

export type ActivityItem = { id: string; departmentId: DepartmentId; time: string; text: string };

export const activity: ActivityItem[] = [
  { id: "v1", departmentId: "ventas", time: "Hace 6 min", text: "Lucía envió 5 seguimientos a leads del webinar de octubre." },
  { id: "v2", departmentId: "ventas", time: "Hace 25 min", text: "Daniel puntuó 8 contactos nuevos; 3 pasan a comercial." },
  { id: "v3", departmentId: "ventas", time: "Hace 1 h", text: "Irene preparó la propuesta para Clínica Dental Sol." },
  { id: "a1", departmentId: "atencion", time: "Hace 3 min", text: "Sofía resolvió una consulta sobre cambios de plan." },
  { id: "a2", departmentId: "atencion", time: "Hace 18 min", text: "Hugo respondió 12 correos de soporte con la plantilla de incidencias." },
  { id: "a3", departmentId: "atencion", time: "Hace 2 h", text: "Sofía escaló una reclamación de facturación a una persona del equipo." },
  { id: "m1", departmentId: "marketing", time: "Hace 10 min", text: "Carla terminó el borrador del boletín de noviembre." },
  { id: "m2", departmentId: "marketing", time: "Hace 40 min", text: "Álvaro propuso 2 cambios en la campaña de otoño." },
  { id: "m3", departmentId: "marketing", time: "Hace 3 h", text: "Se publicaron 4 piezas en redes sociales." },
  { id: "o1", departmentId: "operaciones", time: "Hace 8 min", text: "Nuria actualizó 45 fichas de clientes en el CRM." },
  { id: "o2", departmentId: "operaciones", time: "Hace 32 min", text: "Tomás emitió 3 facturas del cierre de mes." },
  { id: "o3", departmentId: "operaciones", time: "Hace 2 h", text: "Se sincronizaron los pedidos de la tienda con el CRM." },
  { id: "d1", departmentId: "direccion", time: "Hace 15 min", text: "Elena actualizó el cuadro de mando de ventas y gasto." },
  { id: "d2", departmentId: "direccion", time: "Hace 1 h", text: "Elena avisó de un aumento del 12 % en el gasto de créditos de Marketing." },
  { id: "d3", departmentId: "direccion", time: "Ayer", text: "Se envió el informe semanal a la dirección." },
];
