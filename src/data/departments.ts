import type { DepartmentId } from "@/components/glass";

export const departments: { id: DepartmentId; title: string; description: string; agents: number; tag: string }[] = [
  { id: "ventas", title: "Equipo comercial", description: "Cualifica leads, prepara propuestas y hace seguimiento comercial.", agents: 4, tag: "4 agentes" },
  { id: "atencion", title: "Soporte al cliente", description: "Atiende consultas por chat y correo y escala los casos complejos.", agents: 3, tag: "3 agentes" },
  { id: "marketing", title: "Campañas y contenidos", description: "Planifica campañas, redacta contenidos y analiza resultados.", agents: 5, tag: "5 agentes" },
  { id: "operaciones", title: "CRM y facturación", description: "Mantiene el CRM al día y automatiza la facturación y los pedidos.", agents: 2, tag: "2 agentes" },
  { id: "direccion", title: "Resumen ejecutivo", description: "Resume la actividad semanal y avisa de desviaciones de gasto.", agents: 1, tag: "1 agente" },
];
