import type { DepartmentId } from "@/components/glass";

export type MarketCategory = "Marketing" | "Ventas" | "Atención" | "Datos" | "Operaciones";

export const marketCategories: MarketCategory[] = ["Marketing", "Ventas", "Atención", "Datos", "Operaciones"];

/** Departamento de la oficina más afín a cada categoría (color de la tarjeta y sugerencia al contratar). */
export const categoryDepartment: Record<MarketCategory, DepartmentId> = {
  Marketing: "marketing",
  Ventas: "ventas",
  Atención: "atencion",
  Datos: "direccion",
  Operaciones: "operaciones",
};

export type MarketReview = { author: string; company: string; rating: number; text: string };

export type MarketAgent = {
  id: string;
  name: string;
  role: string;
  category: MarketCategory;
  summary: string;
  creator: string;
  /** Empresas que lo usan. */
  companies: number;
  rating: number;
  ratingCount: number;
  /** Coste medio por tarea, en créditos. */
  avgCost: number;
  does: string[];
  doesNot: string[];
  tools: string[];
  examples: string[];
  reviews: MarketReview[];
};

export const marketAgents: MarketAgent[] = [
  {
    id: "mateo-ibanez",
    name: "Mateo Ibáñez",
    role: "Gestor de redes sociales",
    category: "Marketing",
    summary: "Planifica, redacta y programa publicaciones en tus redes con el tono de tu marca.",
    creator: "Verbo Studio",
    companies: 412,
    rating: 4.8,
    ratingCount: 236,
    avgCost: 2.4,
    does: ["Redacta y programa publicaciones semanales", "Adapta el mensaje a cada red", "Resume el rendimiento de cada pieza"],
    doesNot: ["Publica sin tu aprobación previa", "Responde mensajes privados ni comentarios", "Crea imágenes originales"],
    tools: ["Instagram", "LinkedIn", "Canva"],
    examples: ["Preparar el calendario de publicaciones de noviembre", "Convertir una entrada de blog en 4 publicaciones", "Resumir el rendimiento semanal de las redes"],
    reviews: [
      { author: "Clara Beltrán", company: "Casa Olivar", rating: 5, text: "Nos ahorra unas 6 horas semanales y el tono suena a nosotros." },
      { author: "Jorge Millán", company: "Bici Norte", rating: 4, text: "Muy bueno para planificar; a veces hay que ajustar los titulares." },
    ],
  },
  {
    id: "valeria-cortes",
    name: "Valeria Cortés",
    role: "Redactora SEO",
    category: "Marketing",
    summary: "Escribe artículos y fichas de producto optimizados para buscadores.",
    creator: "Rankwise",
    companies: 287,
    rating: 4.6,
    ratingCount: 158,
    avgCost: 5.8,
    does: ["Investiga palabras clave y estructura el artículo", "Redacta textos de 800 a 1.500 palabras", "Propone enlaces internos"],
    doesNot: ["Garantiza posiciones en Google", "Publica directamente en tu web", "Traduce a otros idiomas"],
    tools: ["WordPress", "Google Search Console", "Notion"],
    examples: ["Escribir un artículo sobre mantenimiento de bicicletas eléctricas", "Reescribir 20 fichas de producto", "Auditar los títulos de las 10 páginas principales"],
    reviews: [
      { author: "Rosa Pardo", company: "Tienda Pardo", rating: 5, text: "Subimos un 30 % el tráfico orgánico en tres meses." },
      { author: "Íñigo Cano", company: "Estudio Cano", rating: 4, text: "Buenos textos, aunque conviene revisar los datos concretos." },
    ],
  },
  {
    id: "sergio-montoya",
    name: "Sergio Montoya",
    role: "Prospección en frío",
    category: "Ventas",
    summary: "Encuentra empresas que encajan con tu cliente ideal y les escribe un primer mensaje personalizado.",
    creator: "Leadforge",
    companies: 354,
    rating: 4.5,
    ratingCount: 201,
    avgCost: 3.1,
    does: ["Construye listas de empresas según tu perfil de cliente", "Redacta correos de primer contacto personalizados", "Programa hasta 3 recordatorios"],
    doesNot: ["Envía mensajes sin tu aprobación", "Llama por teléfono", "Compra listas de contactos"],
    tools: ["LinkedIn", "Gmail", "HubSpot"],
    examples: ["Encontrar 50 clínicas dentales en Madrid y Valencia", "Escribir una secuencia de 3 correos para gestorías", "Resumir las respuestas recibidas esta semana"],
    reviews: [
      { author: "Álex Domínguez", company: "Gestoría Dómina", rating: 5, text: "Nos consiguió 12 reuniones en el primer mes." },
      { author: "Nerea Salas", company: "Software Salas", rating: 4, text: "Buena calidad de mensajes. La segmentación se puede afinar." },
    ],
  },
  {
    id: "alba-pena",
    name: "Alba Peña",
    role: "Asistente de reuniones comerciales",
    category: "Ventas",
    summary: "Prepara tus reuniones con clientes y envía las actas y los siguientes pasos.",
    creator: "Estudio Cálamo",
    companies: 198,
    rating: 4.7,
    ratingCount: 97,
    avgCost: 2.2,
    does: ["Prepara un resumen del cliente antes de cada reunión", "Redacta el acta y los siguientes pasos", "Actualiza la oportunidad en el CRM"],
    doesNot: ["Asiste a las reuniones por ti", "Negocia precios", "Envía el acta sin tu visto bueno"],
    tools: ["Google Calendar", "HubSpot", "Gmail"],
    examples: ["Preparar la reunión de mañana con Clínica Sol", "Redactar el acta de la llamada de hoy", "Listar las reuniones sin seguimiento"],
    reviews: [
      { author: "Marta Gil", company: "Consultora Gil", rating: 5, text: "Las actas salen en minutos y no se pierde ningún siguiente paso." },
      { author: "Rubén Ortega", company: "Ortega Seguros", rating: 4, text: "Muy útil; necesita buenas notas de entrada para dar lo mejor." },
    ],
  },
  {
    id: "gael-ferrer",
    name: "Gael Ferrer",
    role: "Soporte multilingüe",
    category: "Atención",
    summary: "Atiende a tus clientes por chat y correo en español, inglés, francés y alemán.",
    creator: "Helpdesk Labs",
    companies: 521,
    rating: 4.9,
    ratingCount: 342,
    avgCost: 0.9,
    does: ["Responde consultas frecuentes en 4 idiomas", "Escala los casos complejos a una persona", "Clasifica las incidencias por urgencia"],
    doesNot: ["Concede reembolsos sin aprobación", "Atiende llamadas de voz", "Modifica pedidos ya enviados"],
    tools: ["Intercom", "Zendesk", "Slack"],
    examples: ["Responder las consultas del chat durante el fin de semana", "Clasificar los 40 correos de la mañana", "Resumir las incidencias más repetidas del mes"],
    reviews: [
      { author: "Lola Vera", company: "Viajes Vera", rating: 5, text: "Atiende a nuestros clientes extranjeros mejor que nosotros." },
      { author: "Pablo Gallego", company: "Tienda Online Gallego", rating: 5, text: "El tiempo de respuesta bajó de horas a minutos." },
    ],
  },
  {
    id: "marina-blasco",
    name: "Marina Blasco",
    role: "Gestión de reseñas",
    category: "Atención",
    summary: "Responde a las reseñas de tus clientes y te avisa de las que necesitan atención.",
    creator: "Opinia Labs",
    companies: 143,
    rating: 4.4,
    ratingCount: 76,
    avgCost: 1.1,
    does: ["Redacta respuestas a reseñas de Google", "Detecta reseñas negativas y las marca", "Resume lo que más valoran tus clientes"],
    doesNot: ["Publica respuestas sin tu aprobación", "Elimina o denuncia reseñas", "Responde en redes sociales"],
    tools: ["Google Business", "Tripadvisor", "Gmail"],
    examples: ["Responder las 15 reseñas nuevas de la semana", "Avisar de reseñas de una o dos estrellas", "Resumir los puntos fuertes del último trimestre"],
    reviews: [
      { author: "Daniela Rubio", company: "Restaurante La Higuera", rating: 4, text: "Respuestas amables y rápidas. Muy buena relación calidad-precio." },
      { author: "Fermín Lara", company: "Hotel Lara", rating: 5, text: "Ahora contestamos todas las reseñas, algo que no lográbamos." },
    ],
  },
  {
    id: "ismael-roca",
    name: "Ismael Roca",
    role: "Analista de datos de ventas",
    category: "Datos",
    summary: "Convierte tus datos de ventas en informes claros con conclusiones y avisos.",
    creator: "Atalaya Analytics",
    companies: 226,
    rating: 4.7,
    ratingCount: 119,
    avgCost: 6.5,
    does: ["Consolida datos de varias fuentes", "Genera informes semanales con gráficos", "Avisa de caídas o picos inusuales"],
    doesNot: ["Modifica los datos originales", "Hace previsiones financieras vinculantes", "Accede a datos que no le conectes"],
    tools: ["Google Sheets", "HubSpot", "Stripe"],
    examples: ["Preparar el informe de ventas de octubre", "Comparar las ventas por canal con el trimestre anterior", "Detectar los clientes con mayor riesgo de baja"],
    reviews: [
      { author: "Teresa Navas", company: "Navas Distribución", rating: 5, text: "Por fin entendemos de dónde vienen las ventas." },
      { author: "Hugo Prieto", company: "Prieto & Hijos", rating: 4, text: "Informes claros. Pedimos más tipos de gráficos." },
    ],
  },
  {
    id: "paula-estevez",
    name: "Paula Estévez",
    role: "Informes financieros",
    category: "Datos",
    summary: "Prepara el cierre mensual y resume ingresos, gastos y márgenes para la dirección.",
    creator: "Atalaya Analytics",
    companies: 164,
    rating: 4.6,
    ratingCount: 88,
    avgCost: 7.2,
    does: ["Prepara el cierre mensual", "Resume ingresos, gastos y márgenes", "Señala desviaciones frente al presupuesto"],
    doesNot: ["Presenta impuestos ni declaraciones", "Aprueba pagos", "Sustituye a tu asesor fiscal"],
    tools: ["Holded", "Google Sheets", "Slack"],
    examples: ["Preparar el cierre de octubre", "Comparar gastos reales y presupuestados", "Resumir el margen por línea de producto"],
    reviews: [
      { author: "Sonia Aguilar", company: "Aguilar Reformas", rating: 5, text: "El cierre mensual pasó de tres días a tres horas." },
      { author: "Víctor Maestre", company: "Maestre Logística", rating: 4, text: "Muy fiable; conviene una revisión final por parte de finanzas." },
    ],
  },
  {
    id: "adrian-lozano",
    name: "Adrián Lozano",
    role: "Conciliación bancaria",
    category: "Operaciones",
    summary: "Casa los movimientos del banco con tus facturas y señala lo que no cuadra.",
    creator: "Flujo Ops",
    companies: 189,
    rating: 4.5,
    ratingCount: 104,
    avgCost: 2.8,
    does: ["Casa movimientos bancarios con facturas", "Detecta cobros duplicados o pendientes", "Prepara un resumen de incidencias"],
    doesNot: ["Mueve dinero ni emite pagos", "Corrige asientos contables sin aprobación", "Accede a tu banca online directamente"],
    tools: ["Holded", "Stripe", "Google Sheets"],
    examples: ["Conciliar los movimientos de octubre", "Listar facturas sin cobrar de más de 30 días", "Detectar cobros duplicados del trimestre"],
    reviews: [
      { author: "Carmen Ríos", company: "Ríos Asesores", rating: 5, text: "Encontró tres cobros duplicados el primer día." },
      { author: "Joaquín Soto", company: "Soto Instalaciones", rating: 4, text: "Hace bien el trabajo pesado. La configuración inicial lleva un rato." },
    ],
  },
  {
    id: "noa-quintana",
    name: "Noa Quintana",
    role: "Gestión de pedidos",
    category: "Operaciones",
    summary: "Sigue cada pedido desde que entra hasta que se entrega y avisa de los retrasos.",
    creator: "Flujo Ops",
    companies: 237,
    rating: 4.8,
    ratingCount: 131,
    avgCost: 1.4,
    does: ["Registra los pedidos nuevos en tu CRM", "Avisa al cliente de cada cambio de estado", "Marca los envíos retrasados"],
    doesNot: ["Gestiona devoluciones", "Cambia precios o stock", "Contacta con transportistas por teléfono"],
    tools: ["Shopify", "HubSpot", "Gmail"],
    examples: ["Registrar los 35 pedidos de hoy", "Avisar a los clientes con envíos retrasados", "Resumir los pedidos pendientes de preparar"],
    reviews: [
      { author: "Lucas Herrero", company: "Herrero Artesanos", rating: 5, text: "Los clientes dejaron de preguntar dónde estaba su pedido." },
      { author: "Irene Campos", company: "Campos Gourmet", rating: 5, text: "Funciona sin tocarlo. Una joya para tiendas pequeñas." },
    ],
  },
];
