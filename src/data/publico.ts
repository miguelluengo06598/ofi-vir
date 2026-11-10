/**
 * Contenido de la web pública. Textos en español de España, tuteando y con frases cortas.
 * Regla: aquí no hay testimonios, logos ni cifras de clientes inventados. Las listas de prueba social
 * están vacías a propósito y sus componentes no se muestran hasta que tengan datos reales.
 */
import type { DepartmentId } from "@/components/glass";

export const CONTACTO_EMAIL = "acceso@samgple.com";

export const problemas = [
  {
    titulo: "Leads que se enfrían porque nadie responde a tiempo",
    texto: "Llega un contacto un viernes a las ocho de la tarde. El lunes ya ha hablado con otro.",
  },
  {
    titulo: "Departamentos que no se hablan y un CRM desactualizado",
    texto: "Ventas no sabe qué preguntó el cliente a soporte. El CRM se rellena cuando alguien se acuerda.",
  },
  {
    titulo: "Horas perdidas en tareas repetitivas",
    texto: "Copiar datos, contestar lo mismo, preparar el informe de cada lunes. Tiempo que no vende.",
  },
] as const;

export const pasos = [
  {
    titulo: "Elige tus departamentos",
    texto: "Activa Ventas, Atención al cliente, Marketing, Operaciones · CRM o Dirección. Son gratis.",
  },
  {
    titulo: "Conecta tus herramientas",
    texto: "Tu CRM, WhatsApp, tu correo y Meta Ads. Los agentes trabajan donde ya trabajas tú.",
  },
  {
    titulo: "Aprueba y deja que trabajen",
    texto: "Los agentes preparan. Lo importante te lo enseñan antes de enviarlo.",
  },
] as const;

export type AgenteEjemplo = { nombre: string; rol: string; hace: string };

/** Agentes de ejemplo por departamento (plantillas de SAMGPLE, publicadas o en preparación). */
export const departamentosPublicos: { id: DepartmentId; resumen: string; agentes: AgenteEjemplo[] }[] = [
  {
    id: "ventas",
    resumen: "Responde a cada lead en minutos y le hace seguimiento hasta que alguien de tu equipo cierra.",
    agentes: [
      { nombre: "Lucía", rol: "Primera respuesta", hace: "Contesta al lead, le pregunta lo justo y lo cualifica." },
      { nombre: "Marco", rol: "Cierre", hace: "Prepara la propuesta y te la deja lista para revisar." },
      { nombre: "Paula", rol: "Reactivación", hace: "Recupera contactos que se quedaron a medias." },
    ],
  },
  {
    id: "atencion",
    resumen: "Atiende por WhatsApp y correo, y pasa a una persona lo que no debe resolver sola.",
    agentes: [
      { nombre: "Sara", rol: "WhatsApp", hace: "Responde dudas, da citas y escala los casos delicados." },
      { nombre: "Leo", rol: "Correo", hace: "Ordena la bandeja y redacta respuestas para que las apruebes." },
    ],
  },
  {
    id: "marketing",
    resumen: "Prepara contenidos y campañas, y aprende de qué leads acaban comprando.",
    agentes: [
      { nombre: "Nora", rol: "Contenido", hace: "Redacta publicaciones y correos con el tono de tu marca." },
      { nombre: "Teo", rol: "Anuncios", hace: "Revisa tus campañas de Meta Ads y propone cambios." },
    ],
  },
  {
    id: "operaciones",
    resumen: "Mantiene el CRM al día con todo lo que pasa en los demás departamentos.",
    agentes: [{ nombre: "Iván", rol: "CRM", hace: "Registra contactos, notas y etapas sin duplicar fichas." }],
  },
  {
    id: "direccion",
    resumen: "Te cuenta qué ha pasado en la semana y coordina el trabajo entre departamentos.",
    agentes: [
      { nombre: "Ada", rol: "Análisis", hace: "Resume resultados y avisa si algo se desvía." },
      { nombre: "Atlas", rol: "Coordinación", hace: "Reparte el trabajo y vigila que nada se quede parado." },
    ],
  },
];

export const cadenaEjemplo = [
  { quien: "Meta Ads", dept: "marketing", texto: "Llega un lead de Meta" },
  { quien: "Lucía · Ventas", dept: "ventas", texto: "Lucía responde en minutos" },
  { quien: "Iván · CRM", dept: "operaciones", texto: "Iván lo registra en el CRM" },
  { quien: "Marketing", dept: "marketing", texto: "Marketing aprende qué leads compran" },
] as const satisfies readonly { quien: string; dept: DepartmentId; texto: string }[];

export const garantias = [
  {
    titulo: "Nada sensible sale sin tu aprobación",
    texto: "Un correo a un cliente, un gasto o una publicación esperan a que tú digas que sí.",
  },
  {
    titulo: "Los agentes solo trabajan cuando llega algo o tú se lo pides",
    texto: "Un mensaje, un lead, una orden tuya o una rutina que tú activaste. Nunca por su cuenta.",
  },
  {
    titulo: "Cada agente está certificado por SAMGPLE",
    texto: "Antes de tocar datos reales pasa un examen técnico y una revisión de una persona.",
  },
  {
    titulo: "Tus datos, aislados y en la UE",
    texto: "Cada empresa solo ve lo suyo. Tu base de datos y tus archivos se alojan en la UE.",
  },
] as const;

export const sectores = ["Clínicas", "Academias", "Inmobiliarias", "Gimnasios", "E-commerce", "Reformas"] as const;

export const preguntasFrecuentes = [
  {
    p: "¿Tengo que cambiar de CRM?",
    r: "No. Los agentes se conectan al CRM que ya usas y lo mantienen al día. Si aún no tienes uno, te ayudamos a elegir.",
  },
  {
    p: "¿Puede la IA escribir a mis clientes sin que yo lo vea?",
    r: "Solo si tú lo permites. Por defecto, cada correo o mensaje a un cliente espera tu aprobación. Tú decides, herramienta por herramienta, qué puede hacer cada agente solo y qué no.",
  },
  {
    p: "¿Qué pasa con mis datos?",
    r: "Cada empresa tiene sus datos aislados: nadie de otra empresa puede verlos, y una cuenta de SAMGPLE no da acceso a ellos. La base de datos y los archivos se alojan en la UE. Puedes borrar todo lo que sabemos de un contacto cuando lo pida.",
  },
  {
    p: "¿Cuánto cuesta?",
    r: "Pagas con créditos, solo por lo que hacen tus agentes. 1 crédito es 1 céntimo. No hay cuotas: los departamentos y los agentes son gratis. Puedes empezar con el pack Prueba.",
  },
  {
    p: "¿Qué es la certificación de SAMGPLE?",
    r: "Es la revisión que pasa cada agente antes de trabajar con datos reales: un examen técnico automático con datos ficticios y la revisión de una persona de nuestro equipo. Se repite cuando cambias algo importante y cada seis meses.",
  },
  {
    p: "¿Y si se me acaban los créditos?",
    r: "Te avisamos antes. Sin saldo, los agentes dejan de empezar tareas nuevas, pero lo que llega se guarda para que no pierdas nada. Puedes activar la recarga automática y fijar un tope de gasto al mes.",
  },
  {
    p: "¿Necesito saber de IA?",
    r: "No. Nos cuentas cómo es tu negocio con tus palabras y el asistente te propone la configuración. Tú la revisas y la pruebas antes de activarla.",
  },
] as const;

// ── Prueba social: vacía hasta tener datos reales y autorizados ──────────────────────────────────
export type Testimonio = { cita: string; nombre: string; cargo: string; empresa: string };
export type LogoCliente = { nombre: string; src: string; ancho: number; alto: number };
export type CifraCliente = { valor: string; texto: string; fuente: string };

/** No añadir nada aquí sin permiso escrito del cliente. */
export const testimonios: Testimonio[] = [];
export const logosClientes: LogoCliente[] = [];
export const cifrasClientes: CifraCliente[] = [];
