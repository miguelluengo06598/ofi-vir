import type { DepartmentId } from "@/components/glass";

export type ApprovalPreview = {
  label: string;
  fields: { label: string; value: string }[];
  body: string;
};

export type EmailAttachment = { name: string; kind: "pdf" | "doc" | "sheet" | "image"; size: string };

/** Borrador de correo que el agente quiere enviar. */
export type ApprovalEmail = {
  /** Cliente de la memoria al que va dirigido (clave de `contactDirectory`). */
  contactId: string;
  toName: string;
  toEmail: string;
  subject: string;
  body: string;
  attachments?: EmailAttachment[];
};

export type Approval = {
  id: string;
  agentId: string;
  departmentId: DepartmentId;
  title: string;
  detail: string;
  requested: string;
  /** Coste estimado de ejecutar la acción, en créditos. */
  costCredits: number;
  preview: ApprovalPreview;
  /** Si la acción es enviar un correo: el borrador completo (vista previa y editor). */
  email?: ApprovalEmail;
};

const emailPreview = (e: ApprovalEmail): ApprovalPreview => ({
  label: "Borrador del correo",
  fields: [
    { label: "Para", value: `${e.toName} <${e.toEmail}>` },
    { label: "Asunto", value: e.subject },
  ],
  body: e.body,
});

const laura: ApprovalEmail = {
  contactId: "laura",
  toName: "Laura Gómez",
  toEmail: "laura@clinicasol.example",
  subject: "Propuesta: gestión de citas con IA para Clínica Sol",
  body: "Hola, Laura:\n\nGracias por tu respuesta. Entiendo que el precio te parece alto frente a la otra oferta que tenéis; por eso te adjunto la propuesta del plan anual con todo detallado, para que puedas compararlas punto por punto: recordatorios automáticos por WhatsApp, confirmación por correo y gestión de cancelaciones.\n\nLa inversión es de 4.200 € al año y la propuesta es válida durante 15 días. Si te encaja, podemos hablar el jueves por la tarde.\n\nUn saludo,\nIrene Soler · Ventas",
  attachments: [{ name: "Propuesta-Clinica-Sol.pdf", kind: "pdf", size: "412 KB" }],
};

const marta: ApprovalEmail = {
  contactId: "marta",
  toName: "Marta Ibáñez",
  toEmail: "marta@ibanezasociados.example",
  subject: "Protección de datos y secreto profesional: documento de seguridad",
  body: "Hola, Marta:\n\nTe adjunto el resumen de seguridad de nuestros agentes certificados: cómo se tratan y se cifran los datos, dónde se almacenan (Unión Europea) y qué garantías ofrecen para el RGPD y el secreto profesional. Ningún agente conserva datos de tus clientes fuera de tu oficina virtual.\n\nSi quieres, lo repasamos juntas en la demo.\n\nUn saludo,\nSofía Navarro · Atención al cliente",
  attachments: [
    { name: "Seguridad-y-RGPD.pdf", kind: "pdf", size: "1,2 MB" },
    { name: "Encargado-de-tratamiento.docx", kind: "doc", size: "86 KB" },
  ],
};

const javier: ApprovalEmail = {
  contactId: "javier",
  toName: "Javier Ortega",
  toEmail: "javier@reformasortega.example",
  subject: "Re: Duda sobre el IVA y los plazos de pago",
  body: "Hola, Javier:\n\nEl precio del plan trimestral (2.800 €) no incluye IVA; se añade el 21 % en la factura. Sobre el pago: ya está acordada la transferencia a 30 días desde la fecha de factura, así que no tienes que hacer nada más.\n\nTe enviaremos la factura en el cierre de mes.\n\nUn saludo,\nHugo Lara · Atención al cliente",
};

export const approvals: Approval[] = [
  {
    id: "apr-propuesta-clinica-sol",
    agentId: "irene-soler",
    departmentId: "ventas",
    title: "Enviar propuesta a Clínica Sol",
    detail: "Plan anual de gestión de citas · 4.200 € · válida 15 días",
    requested: "Hace 35 min",
    costCredits: 1.8,
    email: laura,
    preview: emailPreview(laura),
  },
  {
    id: "apr-rgpd-ibanez",
    agentId: "sofia-navarro",
    departmentId: "atencion",
    title: "Enviar el documento de seguridad a Ibáñez & Asociados",
    detail: "Responde a su objeción de protección de datos · 2 adjuntos",
    requested: "Hace 20 min",
    costCredits: 0.9,
    email: marta,
    preview: emailPreview(marta),
  },
  {
    id: "apr-iva-ortega",
    agentId: "hugo-lara",
    departmentId: "atencion",
    title: "Responder a Reformas Ortega sobre el IVA",
    detail: "Aclara que el precio no incluye IVA y confirma el pago a 30 días",
    requested: "Hace 12 min",
    costCredits: 0.4,
    email: javier,
    preview: emailPreview(javier),
  },
  {
    id: "apr-anuncio-otono",
    agentId: "alvaro-rios",
    departmentId: "marketing",
    title: "Publicar el anuncio «Otoño en casa» en Meta Ads",
    detail: "Presupuesto de 350 € durante 7 días · público: Madrid y Valencia",
    requested: "Hace 40 min",
    costCredits: 4.5,
    preview: {
      label: "Vista previa del anuncio",
      fields: [
        { label: "Plataforma", value: "Meta Ads (Facebook e Instagram)" },
        { label: "Titular", value: "Otoño en casa: renueva tu salón" },
        { label: "Público", value: "Madrid y Valencia · 28–55 años" },
        { label: "Presupuesto", value: "350 € en 7 días" },
      ],
      body: "Descubre la colección de otoño con envío gratis en pedidos de más de 60 €. Mantas, cojines y luz cálida para estrenar la estación.",
    },
  },
  {
    id: "apr-presupuesto-google",
    agentId: "alvaro-rios",
    departmentId: "marketing",
    title: "Ampliar un 20 % el presupuesto de Google Ads",
    detail: "De 1.500 € a 1.800 € al mes · la campaña supera su objetivo de clics",
    requested: "Hace 1 h",
    costCredits: 0.6,
    preview: {
      label: "Cambio propuesto",
      fields: [
        { label: "Campaña", value: "Búsqueda · Otoño" },
        { label: "Presupuesto mensual", value: "1.500 € → 1.800 € (+20 %)" },
        { label: "Motivo", value: "Supera su objetivo de clics en un 18 %" },
      ],
      body: "Si apruebas, el nuevo presupuesto se aplica desde mañana y se revisa el viernes con los resultados de la semana.",
    },
  },
  {
    id: "apr-presupuesto-clinicas",
    agentId: "alvaro-rios",
    departmentId: "marketing",
    title: "Subir un 30 % el presupuesto de «Clínicas dentales – Madrid»",
    detail: "De 900 € a 1.170 € al mes · sus leads convierten el doble que la media",
    requested: "Hace 4 min",
    costCredits: 0.8,
    preview: {
      label: "Cambio propuesto",
      fields: [
        { label: "Campaña", value: "Clínicas dentales – Madrid" },
        { label: "Presupuesto mensual", value: "900 € → 1.170 € (+30 %)" },
        { label: "Motivo", value: "12 leads con buen perfil y una venta cerrada; convierten el doble que la media" },
      ],
      body: "Si apruebas, el nuevo presupuesto se aplica desde mañana y se revisa el viernes con los resultados de la semana.",
    },
  },
];

export type ActivityItem = { id: string; departmentId: DepartmentId; time: string; text: string };

export const activity: ActivityItem[] = [
  { id: "v1", departmentId: "ventas", time: "Hace 6 min", text: "Lucía envió 5 seguimientos a leads del webinar de octubre." },
  { id: "v2", departmentId: "ventas", time: "Hace 25 min", text: "Daniel puntuó 8 contactos nuevos; 3 pasan a comercial." },
  { id: "v3", departmentId: "ventas", time: "Hace 1 h", text: "Irene preparó la propuesta para Clínica Sol." },
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
