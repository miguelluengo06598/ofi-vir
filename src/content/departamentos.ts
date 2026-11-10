/**
 * Departamentos de la web pública: una entrada por página /departamentos/[slug].
 * Fuente única: el mega menú, el índice, el pie y cada página leen de aquí.
 *
 * `ficha` es el contenido completo de la página de cada departamento (agentes, un día de trabajo, conexiones,
 * permisos). Sale de las plantillas de `src/lib/agentes/plantillas/` y de `src/data/publico.ts`: lo que no está
 * definido en ninguno de los dos lleva `revisar` con el motivo, en vez de inventarlo. Las marcas se ven en la
 * página fuera de producción («Por revisar»). Mientras un departamento no tenga `ficha`, su página usa la
 * plantilla sencilla con «Contenido provisional».
 */
import type { DepartmentId } from "@/components/glass/tokens";
import type { VideoId } from "@/config/videos";
import { departamentosPublicos, type AgenteEjemplo } from "@/data/publico";
import type { TipoDeTareaId } from "@/lib/creditos/tarifas";

/** Nota para quien revisa el contenido: qué falta por confirmar y por qué. */
export type Revisar = { revisar?: string };

export type AgenteFicha = Revisar & {
  nombre: string;
  rol: string;
  /** Una línea: lo que se lee en la cara delantera de la tarjeta. */
  linea: string;
  /** Lo que hace, en frases cortas: la cara trasera. */
  queHace: string[];
  /** Plantilla de IDESIE de la que sale (null = aún no existe). */
  plantilla: string | null;
};

/** Un momento de «Un día con…». Las tres `tipica` son las tareas típicas del departamento. */
export type MomentoDelDia = Revisar & {
  hora: string;
  dia?: string;
  fueraDeHorario?: boolean;
  agente: string;
  titulo: string;
  /** Lo que llega, literal (mensaje, formulario, traspaso). */
  entrada: string;
  /** Lo que hace el agente. */
  hace: string;
  /** Si el resultado espera a una persona. */
  esperaAprobacion?: boolean;
  tipoTarea: TipoDeTareaId;
  tipica?: boolean;
};

export type HerramientaConectada = Revisar & {
  nombre: string;
  /** Logo en public/integraciones (sin logo = icono genérico). */
  logo?: string;
  /** Proveedor del registro de conexiones (src/lib/integraciones/proveedores.ts); null = integrado en la plataforma. */
  proveedor: string | null;
  para: string;
};

export type ConexionDepartamento = Revisar & { con: DepartmentId; que: string };

export type Permisos = {
  sola: (Revisar & { texto: string })[];
  /** `fija` = la plantilla no deja quitar la aprobación. */
  aprobacion: (Revisar & { texto: string; fija?: boolean })[];
  nunca: (Revisar & { texto: string })[];
};

export type FichaDepartamento = {
  /** Color de acento (el del departamento en la oficina). */
  acento: string;
  problema: Revisar & { titulo: string; texto: string };
  agentes: AgenteFicha[];
  dia: MomentoDelDia[];
  herramientas: HerramientaConectada[];
  departamentos: ConexionDepartamento[];
  permisos: Permisos;
  final: { titular: string; texto: string };
};

export type SlugDepartamento = "ventas" | "atencion-al-cliente" | "marketing" | "operaciones-crm" | "direccion";

export type DepartamentoPublico = {
  slug: SlugDepartamento;
  /** Token de color e icono del sistema de cristal (departmentMeta). */
  tono: DepartmentId;
  nombre: string;
  /** Una línea para el mega menú y las tarjetas. */
  linea: string;
  titular: string;
  subtitulo: string;
  video: VideoId;
  agentes: AgenteEjemplo[];
  secciones: { titulo: string; texto: string }[];
  ficha?: FichaDepartamento;
};

const agentesDe = (tono: DepartmentId) => departamentosPublicos.find((d) => d.id === tono)?.agentes ?? [];

export const DEPARTAMENTOS: DepartamentoPublico[] = [
  {
    slug: "ventas",
    tono: "ventas",
    nombre: "Ventas",
    linea: "Responde a cada lead en minutos y le hace seguimiento.",
    titular: "Ningún lead se queda sin respuesta",
    subtitulo: "Lucía contesta, cualifica y propone cita. Marco prepara la propuesta. Paula recupera a los que se enfriaron.",
    video: "departamento-ventas",
    agentes: agentesDe("ventas"),
    secciones: [
      { titulo: "Primera respuesta en minutos", texto: "Contenido provisional: cómo responde Lucía a un lead nuevo, a cualquier hora." },
      { titulo: "Cualificación con tus criterios", texto: "Contenido provisional: qué pregunta y cuándo pasa el lead a tu equipo." },
      { titulo: "Seguimiento hasta la cita", texto: "Contenido provisional: recordatorios y reactivación de contactos." },
    ],
    ficha: {
      acento: "#3B82F6",
      problema: {
        titulo: "Un lead que espera es un lead que se va",
        texto: "Llega un contacto un viernes a las ocho de la tarde. El lunes ya ha hablado con otro. Ventas contesta en minutos, a cualquier hora, y deja preparada la cita para tu equipo.",
      },
      agentes: [
        {
          nombre: "Lucía",
          rol: "Primera respuesta",
          linea: "Contesta al lead, le pregunta lo justo y lo cualifica.",
          plantilla: "lucia-sdr",
          queHace: [
            "Contesta a cada lead nuevo por correo o WhatsApp en cuanto llega.",
            "Le hace de 3 a 5 preguntas: qué necesita, para cuándo, presupuesto y quién decide.",
            "Mira tu agenda y propone dos o tres huecos para una reunión.",
            "Lo anota todo en tu CRM y pasa a tu equipo lo que no le toca.",
          ],
        },
        {
          nombre: "Marco",
          rol: "Cierre",
          linea: "Prepara la propuesta y te la deja lista para revisar.",
          plantilla: null,
          queHace: ["Prepara la propuesta después de la reunión.", "Te la deja lista para revisar antes de enviarla."],
          revisar: "La plantilla marco-cierre aún no existe: el detalle de lo que hace está por definir.",
        },
        {
          nombre: "Paula",
          rol: "Reactivación",
          linea: "Recupera contactos que se quedaron a medias.",
          plantilla: null,
          queHace: ["Encuentra los contactos que dejaron de responder.", "Propone un seguimiento para que lo apruebes."],
          revisar: "La plantilla paula-reactivacion aún no existe: el detalle de lo que hace está por definir.",
        },
      ],
      dia: [
        {
          hora: "09:10",
          agente: "Lucía",
          titulo: "Cualifica a un lead que ha contestado",
          entrada: "«Lo necesitamos para el trimestre que viene. Somos 12 personas y decido yo. Presupuesto, unos 3.000 €.»",
          hace: "Ve que encaja, mira tu agenda y le propone el jueves a las 11:00 o el viernes a las 10:30. En el CRM, la etapa pasa a «Cualificado».",
          esperaAprobacion: true,
          tipoTarea: "estandar",
          tipica: true,
        },
        {
          hora: "11:40",
          agente: "Lucía",
          titulo: "Deja la cita preparada",
          entrada: "«El jueves a las 11:00 me va perfecto.»",
          hace: "Crea la cita en tu agenda y anota el acuerdo. No le dice que está confirmada hasta que tú la apruebas.",
          esperaAprobacion: true,
          tipoTarea: "estandar",
        },
        {
          hora: "13:25",
          agente: "Lucía",
          titulo: "Pasa a Atención a un cliente que ya lo es",
          entrada: "Un cliente actual pregunta cómo cambiar la fecha de su factura.",
          hace: "No intenta venderle nada: se lo pasa a Atención al cliente con un resumen de una línea.",
          tipoTarea: "estandar",
        },
        {
          hora: "16:20",
          agente: "Lucía",
          titulo: "Te pasa lo que no debe decidir ella",
          entrada: "«¿Cuánto cuesta exactamente? ¿Me hacéis un 20 % si firmo esta semana?»",
          hace: "No inventa precios ni promete descuentos. Le dice que lo confirma una persona y te lo pasa con lo que ya sabe del lead.",
          tipoTarea: "estandar",
          tipica: true,
        },
        {
          hora: "21:47",
          dia: "viernes",
          fueraDeHorario: true,
          agente: "Lucía",
          titulo: "Responde a un lead nuevo fuera de horario",
          entrada: "Formulario web: «Hola, soy Laura Gómez, de Clínica Sol. Me interesa vuestro servicio de gestión de citas.»",
          hace: "Comprueba que no está ya en tu CRM, la da de alta y prepara un correo breve con dos preguntas. Si has elegido no responder fuera de horario, lo guarda hasta que abras.",
          esperaAprobacion: true,
          tipoTarea: "estandar",
          tipica: true,
        },
      ],
      herramientas: [
        { nombre: "Correo", proveedor: null, para: "Contesta a los leads que escriben por correo." },
        { nombre: "WhatsApp", logo: "/integraciones/whatsapp.svg", proveedor: "whatsapp", para: "Contesta en el mismo canal en el que escribió el lead." },
        { nombre: "Google Calendar", logo: "/integraciones/google_calendar.svg", proveedor: "google_calendar", para: "Ve tus huecos libres y deja la cita preparada." },
        { nombre: "HubSpot", logo: "/integraciones/hubspot.svg", proveedor: "hubspot", para: "Busca, da de alta y actualiza cada contacto." },
        {
          nombre: "Meta Ads",
          logo: "/integraciones/meta_ads.svg",
          proveedor: "meta_ads",
          para: "Recibe los leads de tus anuncios en cuanto llegan.",
          revisar: "La plantilla de Lucía no usa Meta Ads y aún no existe el webhook de leads de Meta: confirmar antes de anunciarlo.",
        },
      ],
      departamentos: [
        { con: "atencion", que: "Le pasa los clientes actuales con dudas de postventa." },
        { con: "operaciones", que: "Iván registra en el CRM lo que Ventas acuerda con cada lead." },
        {
          con: "marketing",
          que: "Le cuenta qué leads acaban comprando para que afine los anuncios.",
          revisar: "Sale de la cadena de ejemplo de la web; las plantillas de Marketing (Nora, Teo) aún no existen.",
        },
      ],
      permisos: {
        sola: [
          { texto: "Buscar en tu CRM y en la memoria antes de escribir" },
          { texto: "Dar de alta y actualizar contactos en el CRM, sin duplicar fichas" },
          { texto: "Mirar tus huecos libres en la agenda" },
          { texto: "Pasarte a ti, o a otro departamento, lo que no le toca" },
        ],
        aprobacion: [
          { texto: "Cada correo a un lead", fija: true },
          { texto: "Cada mensaje de WhatsApp a un lead", fija: true },
          { texto: "Crear una cita en tu agenda", fija: true },
        ],
        nunca: [
          { texto: "Dar precios cerrados, descuentos o condiciones que no hayas escrito" },
          { texto: "Negociar o cerrar la venta" },
          { texto: "Borrar o fusionar contactos del CRM" },
          { texto: "Escribir a quien no te ha escrito antes" },
        ],
      },
      final: {
        titular: "Que el próximo lead tenga respuesta en minutos",
        texto: "Nos cuentas cómo te llegan los clientes y dejamos a Lucía trabajando con tu agenda y tu CRM.",
      },
    },
  },
  {
    slug: "atencion-al-cliente",
    tono: "atencion",
    nombre: "Atención al cliente",
    linea: "Atiende WhatsApp y correo, y pasa lo delicado a una persona.",
    titular: "Tus clientes, atendidos a la primera",
    subtitulo: "Sara resuelve por WhatsApp lo que se puede resolver y deriva a tu equipo lo que no.",
    video: "departamento-atencion-al-cliente",
    agentes: agentesDe("atencion"),
    secciones: [
      { titulo: "Respuestas con lo que sabe tu negocio", texto: "Contenido provisional: conocimiento, horarios y tono." },
      { titulo: "Quejas a una persona", texto: "Contenido provisional: qué se deriva y cómo se avisa." },
      { titulo: "Fuera de horario", texto: "Contenido provisional: responder y avisar, o esperar a la apertura." },
    ],
  },
  {
    slug: "marketing",
    tono: "marketing",
    nombre: "Marketing",
    linea: "Prepara campañas y aprende qué leads acaban comprando.",
    titular: "Campañas que aprenden de tus ventas",
    subtitulo: "Nora escribe con el tono de tu marca y Teo revisa tus anuncios con los datos de lo que de verdad vende.",
    video: "departamento-marketing",
    agentes: agentesDe("marketing"),
    secciones: [
      { titulo: "Contenido con tu tono", texto: "Contenido provisional: publicaciones y correos para aprobar." },
      { titulo: "Anuncios con datos de ventas", texto: "Contenido provisional: Meta Ads y lo que aprende de la cadena." },
      { titulo: "Propuestas ordenadas por impacto", texto: "Contenido provisional: qué cambiar primero." },
    ],
  },
  {
    slug: "operaciones-crm",
    tono: "operaciones",
    nombre: "Operaciones · CRM",
    linea: "Mantiene el CRM al día sin duplicar fichas.",
    titular: "Un CRM que se rellena solo",
    subtitulo: "Iván registra lo que pasa en los demás departamentos, fusiona duplicados y completa fichas.",
    video: "departamento-operaciones-crm",
    agentes: agentesDe("operaciones"),
    secciones: [
      { titulo: "Cada conversación, en su ficha", texto: "Contenido provisional: notas y etapas que llegan de otros agentes." },
      { titulo: "Duplicados fusionados con aprobación", texto: "Contenido provisional: nada se borra sin tu sí." },
      { titulo: "Tu CRM de siempre", texto: "Contenido provisional: conexiones disponibles." },
    ],
  },
  {
    slug: "direccion",
    tono: "direccion",
    nombre: "Dirección",
    linea: "Resume el día y coordina el trabajo entre departamentos.",
    titular: "Sabes qué ha pasado sin preguntar",
    subtitulo: "Ada analiza los resultados y Atlas reparte el trabajo y vigila que nada se quede parado.",
    video: "departamento-direccion",
    agentes: agentesDe("direccion"),
    secciones: [
      { titulo: "Resumen del día", texto: "Contenido provisional: leads, citas, tiempos y pendientes." },
      { titulo: "Objetivos repartidos", texto: "Contenido provisional: cómo coordina Atlas a los departamentos." },
      { titulo: "Alertas a tiempo", texto: "Contenido provisional: desviaciones de gasto y de resultados." },
    ],
  },
];

export const departamentoPorSlug = (slug: string) => DEPARTAMENTOS.find((d) => d.slug === slug);
