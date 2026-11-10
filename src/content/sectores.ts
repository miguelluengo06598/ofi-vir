/**
 * Sectores de la web pública: ejemplos de uso ficticios, no casos de clientes ni promesas de resultado.
 * Cada entrada alimenta el índice y su página /sectores/[slug].
 */
import { Dumbbell, GraduationCap, Hammer, House, ShoppingBag, Stethoscope, type LucideIcon } from "lucide-react";
import type { SceneId } from "@/data/scenes";
import type { SlugDepartamento } from "./departamentos";

export type SlugSector = "clinicas" | "academias" | "inmobiliarias" | "gimnasios" | "ecommerce" | "reformas";

type MensajeSector = { de: "cliente" | "agente"; nombre: string; texto: string };

export type SectorPublico = {
  slug: SlugSector;
  nombre: string;
  icono: LucideIcon;
  linea: string;
  titular: string;
  problema: { titulo: string; texto: string };
  resuelve: { titulo: string; texto: string };
  /** Escena ficticia que resume el uso; también se muestra en el héroe. */
  ejemplo: string;
  departamentos: SlugDepartamento[];
  recomendados: { departamento: SlugDepartamento; agentes: { nombre: string; rol: string }[] }[];
  herramientas: { nombre: string; para: string }[];
  escena: SceneId;
  acento: string;
  conversacion: { canal: "WhatsApp" | "Correo"; asunto?: string; mensajes: MensajeSector[] };
};

export const SECTORES: SectorPublico[] = [
  {
    slug: "clinicas",
    nombre: "Clínicas",
    icono: Stethoscope,
    linea: "Citas, recordatorios y consultas por WhatsApp.",
    titular: "Que cada consulta encuentre respuesta, también al final del día",
    problema: { titulo: "Las dudas llegan cuando recepción ya ha cerrado", texto: "Cambios de cita, preguntas sobre un tratamiento o alguien que quiere saber si hay hueco. Si se acumulan hasta la mañana siguiente, la conversación empieza tarde y recepción tiene que recomponer el contexto." },
    resuelve: { titulo: "Atiende el primer contacto y deja claro qué requiere una persona", texto: "La oficina responde con la información aprobada, propone opciones de agenda y recoge el motivo de la consulta. No diagnostica, no confirma tratamientos y pasa a recepción lo que debe revisar una persona." },
    ejemplo: "Sara responde a las 23:00 a quien pregunta por una limpieza y le propone dos opciones de cita para que recepción las confirme.",
    departamentos: ["ventas", "atencion-al-cliente", "operaciones-crm"],
    recomendados: [
      { departamento: "atencion-al-cliente", agentes: [{ nombre: "Sara", rol: "Dudas y cambios de cita" }] },
      { departamento: "ventas", agentes: [{ nombre: "Lucía", rol: "Primer contacto de tratamientos" }] },
      { departamento: "operaciones-crm", agentes: [{ nombre: "Iván", rol: "Ficha y agenda" }] },
    ],
    herramientas: [{ nombre: "WhatsApp", para: "Responder consultas y cambios de cita" }, { nombre: "Calendario", para: "Proponer huecos disponibles" }, { nombre: "CRM", para: "Guardar el motivo y el próximo paso" }],
    escena: "noche",
    acento: "#14B8A6",
    conversacion: { canal: "WhatsApp", mensajes: [
      { de: "cliente", nombre: "Persona interesada", texto: "Hola, ¿tenéis hueco esta semana para una limpieza?" },
      { de: "agente", nombre: "Sara · asistente de la clínica", texto: "Hola. Puedo proponerte el jueves a las 17:00 o el viernes a las 10:30. ¿Cuál te viene mejor?" },
      { de: "cliente", nombre: "Persona interesada", texto: "El jueves, por favor." },
      { de: "agente", nombre: "Sara · asistente de la clínica", texto: "Dejo la solicitud preparada para que recepción la confirme contigo. Si es tu primera visita, te pedirán unos datos antes de la cita." },
    ] },
  },
  {
    slug: "academias",
    nombre: "Academias",
    icono: GraduationCap,
    linea: "Matrículas, información de cursos y seguimiento.",
    titular: "Que quien quiere aprender sepa cómo empezar",
    problema: { titulo: "Horarios, niveles y matrículas se repiten durante todo el día", texto: "Las mismas dudas llegan por formularios, correo, anuncios y WhatsApp. Cuando la respuesta tarda, el equipo pierde tiempo buscando la información del curso y el interesado sigue comparando opciones." },
    resuelve: { titulo: "Informa con el programa correcto y ordena cada matrícula", texto: "La oficina explica horarios, requisitos y plazos aprobados; recoge nivel y disponibilidad, y deja el contacto listo para que admisiones continúe la conversación." },
    ejemplo: "Lucía recibe una consulta sobre inglés de octubre, comparte los horarios aprobados y pide el nivel para orientar la matrícula.",
    departamentos: ["ventas", "atencion-al-cliente", "marketing"],
    recomendados: [
      { departamento: "ventas", agentes: [{ nombre: "Lucía", rol: "Información y cualificación de matrículas" }] },
      { departamento: "atencion-al-cliente", agentes: [{ nombre: "Sara", rol: "Dudas de alumnado" }] },
      { departamento: "marketing", agentes: [{ nombre: "Teo", rol: "Seguimiento de campañas de captación" }] },
    ],
    herramientas: [{ nombre: "Correo", para: "Responder formularios y enviar información" }, { nombre: "CRM", para: "Ordenar interesados por curso" }, { nombre: "Meta Ads", para: "Recoger contactos de campañas" }],
    escena: "atardecer",
    acento: "#F59E0B",
    conversacion: { canal: "Correo", asunto: "Curso de inglés de octubre", mensajes: [
      { de: "cliente", nombre: "Persona interesada", texto: "Hola, ¿tenéis grupos de inglés por la tarde en octubre?" },
      { de: "agente", nombre: "Lucía · admisiones", texto: "Sí. Tenemos dos horarios de tarde para octubre. ¿Qué nivel crees que tienes y qué días te encajan mejor?" },
      { de: "cliente", nombre: "Persona interesada", texto: "Intermedio, martes y jueves." },
      { de: "agente", nombre: "Lucía · admisiones", texto: "Anoto tu preferencia y te dejo la información de matrícula preparada para revisarla contigo." },
    ] },
  },
  {
    slug: "inmobiliarias",
    nombre: "Inmobiliarias",
    icono: House,
    linea: "Leads de portales, visitas y fichas de clientes.",
    titular: "Del portal a la visita, sin perder el hilo",
    problema: { titulo: "Un mismo interesado puede llegar por varios portales y en cualquier momento", texto: "Los agentes tienen que averiguar qué vivienda vio, qué busca y cuándo puede visitar. Si un lead queda sin responder o se duplica, el equipo empieza cada conversación desde cero." },
    resuelve: { titulo: "Cualifica la búsqueda y prepara la visita con contexto", texto: "La oficina identifica el anuncio, pregunta lo esencial, propone disponibilidad y crea una ficha clara para la persona comercial. No promete que una vivienda siga disponible ni cierra condiciones." },
    ejemplo: "Lucía recibe un lead de un portal un domingo, pregunta qué horario le viene bien y deja dos opciones de visita para el lunes.",
    departamentos: ["ventas", "operaciones-crm", "direccion"],
    recomendados: [
      { departamento: "ventas", agentes: [{ nombre: "Lucía", rol: "Primer contacto de compradores y alquileres" }] },
      { departamento: "operaciones-crm", agentes: [{ nombre: "Iván", rol: "Ficha, duplicados y agenda" }] },
      { departamento: "direccion", agentes: [{ nombre: "Atlas", rol: "Resumen de demanda y seguimiento" }] },
    ],
    herramientas: [{ nombre: "CRM", para: "Unificar el historial del interesado" }, { nombre: "Calendario", para: "Proponer visitas" }, { nombre: "Correo", para: "Recibir formularios de portales" }],
    escena: "atardecer",
    acento: "#3B82F6",
    conversacion: { canal: "WhatsApp", mensajes: [
      { de: "cliente", nombre: "Persona interesada", texto: "He visto el piso de tres habitaciones. ¿Se puede visitar?" },
      { de: "agente", nombre: "Lucía · primera respuesta", texto: "Puedo pedir una visita. ¿Buscas para vivir o invertir y qué horario te viene mejor mañana?" },
      { de: "cliente", nombre: "Persona interesada", texto: "Para vivir. A partir de las 18:00." },
      { de: "agente", nombre: "Lucía · primera respuesta", texto: "Dejo dos opciones a partir de esa hora para que el equipo comercial te confirme la visita." },
    ] },
  },
  {
    slug: "gimnasios",
    nombre: "Gimnasios",
    icono: Dumbbell,
    linea: "Altas, clases de prueba y socios que se van.",
    titular: "Que una clase de prueba no se enfríe en la bandeja",
    problema: { titulo: "La intención de probar suele durar poco", texto: "Una consulta sobre tarifas, una clase dirigida o una primera visita llega entre entrenamientos y recepción no siempre puede responder al momento. Después hay que recordar qué quería cada persona." },
    resuelve: { titulo: "Convierte la consulta en una visita preparada", texto: "La oficina explica opciones aprobadas, propone una clase de prueba y deja anotado el objetivo de la persona. Las condiciones comerciales y el alta definitiva quedan para el equipo." },
    ejemplo: "Sara responde a quien pide una clase de prueba, le indica qué traer y deja preparada una hora para que el equipo la confirme.",
    departamentos: ["ventas", "atencion-al-cliente", "marketing"],
    recomendados: [
      { departamento: "ventas", agentes: [{ nombre: "Lucía", rol: "Clases de prueba y primeras visitas" }] },
      { departamento: "atencion-al-cliente", agentes: [{ nombre: "Sara", rol: "Horarios y atención a socios" }] },
      { departamento: "marketing", agentes: [{ nombre: "Teo", rol: "Recordatorios y campañas locales" }] },
    ],
    herramientas: [{ nombre: "WhatsApp", para: "Resolver dudas rápidas" }, { nombre: "Calendario", para: "Proponer clases de prueba" }, { nombre: "CRM", para: "Registrar interés y próximas acciones" }],
    escena: "dia",
    acento: "#F59E0B",
    conversacion: { canal: "WhatsApp", mensajes: [
      { de: "cliente", nombre: "Persona interesada", texto: "¿Puedo probar una clase de fuerza esta semana?" },
      { de: "agente", nombre: "Sara · atención", texto: "Claro. Hay una clase el miércoles a las 19:00 y otra el sábado a las 11:00. ¿Cuál te encaja?" },
      { de: "cliente", nombre: "Persona interesada", texto: "El miércoles." },
      { de: "agente", nombre: "Sara · atención", texto: "Dejo la solicitud preparada para confirmarla contigo. Ven con ropa cómoda y una botella de agua." },
    ] },
  },
  {
    slug: "ecommerce",
    nombre: "E-commerce",
    icono: ShoppingBag,
    linea: "Pedidos, devoluciones y campañas.",
    titular: "Tu tienda, atendida también después de enviar el pedido",
    problema: { titulo: "Las preguntas de pedidos compiten con el trabajo de preparar y vender", texto: "Seguimiento, cambios, devoluciones y dudas de producto llegan de golpe por correo y WhatsApp. Cada consulta exige buscar el pedido y respetar una política antes de responder." },
    resuelve: { titulo: "Orienta, localiza y escala lo que necesita una decisión", texto: "La oficina consulta el estado disponible, explica el siguiente paso aprobado y crea la incidencia si hace falta. No modifica un pedido, no devuelve dinero y no inventa plazos." },
    ejemplo: "Nora recibe «¿dónde está mi pedido?», consulta el seguimiento y deja lista una incidencia si la entrega requiere revisión humana.",
    departamentos: ["atencion-al-cliente", "marketing", "operaciones-crm"],
    recomendados: [
      { departamento: "atencion-al-cliente", agentes: [{ nombre: "Nora", rol: "Pedidos, productos y devoluciones" }] },
      { departamento: "operaciones-crm", agentes: [{ nombre: "Iván", rol: "Fichas e incidencias" }] },
      { departamento: "marketing", agentes: [{ nombre: "Teo", rol: "Segmentos y campañas revisables" }] },
    ],
    herramientas: [{ nombre: "Correo", para: "Atender pedidos y devoluciones" }, { nombre: "CRM", para: "Relacionar pedido, contacto e incidencia" }, { nombre: "Meta Ads", para: "Registrar origen de campañas" }],
    escena: "noche",
    acento: "#8B5CF6",
    conversacion: { canal: "Correo", asunto: "Consulta sobre mi pedido", mensajes: [
      { de: "cliente", nombre: "Cliente", texto: "Hola, ¿dónde está mi pedido? Lo hice hace unos días." },
      { de: "agente", nombre: "Nora · pedidos", texto: "Busco el seguimiento para indicarte el siguiente paso. ¿Me compartes el número de pedido o el correo con el que compraste?" },
      { de: "cliente", nombre: "Cliente", texto: "El pedido es OV-1042." },
      { de: "agente", nombre: "Nora · pedidos", texto: "He dejado la consulta vinculada al pedido para que recibas la actualización correspondiente. Si hay una incidencia, la revisará el equipo." },
    ] },
  },
  {
    slug: "reformas",
    nombre: "Reformas",
    icono: Hammer,
    linea: "Presupuestos, visitas técnicas y seguimiento de obra.",
    titular: "Que cada reforma empiece con una conversación ordenada",
    problema: { titulo: "Las solicitudes llegan con información incompleta y se enfrían esperando respuesta", texto: "Una persona pide presupuesto sin metros, fotos ni fecha. El equipo necesita saber qué tipo de obra es antes de reservar una visita y, mientras tanto, puede perder el hilo entre llamadas y correos." },
    resuelve: { titulo: "Recoge lo justo para preparar una visita técnica", texto: "La oficina hace las preguntas acordadas, clasifica la solicitud y propone disponibilidad. No calcula un presupuesto final ni promete fecha de inicio: prepara el contexto para el profesional." },
    ejemplo: "Lucía recibe una solicitud de reforma de cocina, pide medidas y zona, y deja preparada una visita técnica para confirmar con el equipo.",
    departamentos: ["ventas", "operaciones-crm", "direccion"],
    recomendados: [
      { departamento: "ventas", agentes: [{ nombre: "Lucía", rol: "Solicitud inicial y visita técnica" }] },
      { departamento: "operaciones-crm", agentes: [{ nombre: "Iván", rol: "Ficha de obra y seguimiento" }] },
      { departamento: "direccion", agentes: [{ nombre: "Atlas", rol: "Resumen de propuestas y carga" }] },
    ],
    herramientas: [{ nombre: "WhatsApp", para: "Recibir fotos y dudas iniciales" }, { nombre: "Correo", para: "Ordenar solicitudes de presupuesto" }, { nombre: "CRM", para: "Guardar zona, alcance y próxima visita" }],
    escena: "dia",
    acento: "#F59E0B",
    conversacion: { canal: "WhatsApp", mensajes: [
      { de: "cliente", nombre: "Persona interesada", texto: "Quiero reformar la cocina. ¿Podéis pasar presupuesto?" },
      { de: "agente", nombre: "Lucía · primera respuesta", texto: "Sí. Para preparar una visita, ¿en qué zona está la vivienda y qué parte de la cocina quieres cambiar?" },
      { de: "cliente", nombre: "Persona interesada", texto: "En Alcobendas; muebles, encimera y suelo." },
      { de: "agente", nombre: "Lucía · primera respuesta", texto: "Anoto el alcance y dejo una visita técnica preparada para que el equipo confirme contigo el horario." },
    ] },
  },
];

export const sectorPorSlug = (slug: string) => SECTORES.find((s) => s.slug === slug);
