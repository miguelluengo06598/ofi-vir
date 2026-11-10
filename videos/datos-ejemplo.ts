/**
 * Datos de ejemplo de TODOS los vídeos. Empresa, personas, teléfonos y correos son ficticios:
 * correos en el dominio reservado .test y teléfonos de la serie 600 000 xxx. No usar datos reales.
 * Los créditos salen de las tarifas reales (src/lib/creditos/tarifas.ts), así que siempre cuadran.
 */
import type { DepartmentId } from "@/components/glass/tokens";
import { CONSUMOS_FIJOS, TIPOS_DE_TAREA, type TipoDeTareaId } from "@/lib/creditos/tarifas";

export const ETIQUETA_DEMO = "Demostración con datos de ejemplo";

export const empresa = {
  nombre: "Clínica Sol",
  sector: "Clínica dental",
  ciudad: "Valencia",
  dominio: "clinicasol.test",
  plantilla: 6,
  descripcion:
    "Somos una clínica dental familiar en Valencia con 6 personas. Hacemos limpiezas, ortodoncia invisible e implantes. Nos llegan leads por Meta y por WhatsApp y nos cuesta contestar rápido por las tardes.",
} as const;

export type AgenteEjemplo = { id: string; nombre: string; departamento: DepartmentId; rol: string };

export const agentes = {
  lucia: { id: "lucia", nombre: "Lucía", departamento: "ventas", rol: "Primera respuesta" },
  marco: { id: "marco", nombre: "Marco", departamento: "ventas", rol: "Cierre" },
  paula: { id: "paula", nombre: "Paula", departamento: "ventas", rol: "Reactivación" },
  sara: { id: "sara", nombre: "Sara", departamento: "atencion", rol: "WhatsApp" },
  leo: { id: "leo", nombre: "Leo", departamento: "atencion", rol: "Correo" },
  nora: { id: "nora", nombre: "Nora", departamento: "marketing", rol: "Contenido" },
  teo: { id: "teo", nombre: "Teo", departamento: "marketing", rol: "Anuncios" },
  ivan: { id: "ivan", nombre: "Iván", departamento: "operaciones", rol: "CRM" },
  ada: { id: "ada", nombre: "Ada", departamento: "direccion", rol: "Análisis" },
  atlas: { id: "atlas", nombre: "Atlas", departamento: "direccion", rol: "Coordinación" },
} as const satisfies Record<string, AgenteEjemplo>;

export type AgenteId = keyof typeof agentes;
export const agentesDe = (d: DepartmentId) => Object.values(agentes).filter((a) => a.departamento === d);

/** Qué está haciendo cada departamento en reposo (una línea). */
export const tareaEnCurso: Record<DepartmentId, string> = {
  ventas: "Lucía responde a 3 leads de hoy",
  atencion: "Sara atiende 4 conversaciones de WhatsApp",
  marketing: "Teo revisa la campaña de otoño",
  operaciones: "Iván actualiza 12 fichas del CRM",
  direccion: "Atlas prepara el resumen del día",
};

// ── Leads ────────────────────────────────────────────────────────────────────────────────────────
export const campana = { nombre: "Blanqueamiento · otoño", canal: "Meta Ads", presupuestoDiaEur: 25 } as const;

export const leadPrincipal = {
  nombre: "Elena Prado",
  correo: "elena.prado@correo.test",
  telefono: "+34 600 000 112",
  origen: "Meta Ads · Blanqueamiento · otoño",
  interes: "Blanqueamiento dental",
  mensaje: "Hola, ¿cuánto dura el tratamiento y tenéis cita esta semana por la tarde?",
  /** Ficha del CRM antes y después del traspaso de Lucía a Iván. */
  fichaAntes: { etapa: "Nuevo", proximoPaso: "—", actualizado: "Sin datos" },
  fichaDespues: { etapa: "Cualificado", proximoPaso: "Cita jueves 17:30", actualizado: "Hace 1 min · Iván" },
  respuestaLucia:
    "Hola, Elena. El blanqueamiento son dos sesiones de una hora. Esta semana tenemos el jueves a las 17:30 o el viernes a las 18:00. ¿Te va bien alguna?",
  minutosEnResponder: 3,
} as const;

export const otrosLeads = [
  { nombre: "Jorge Almela", interes: "Ortodoncia invisible", origen: "Formulario web", calidad: "Alta" },
  { nombre: "Nuria Bosch", interes: "Limpieza", origen: "WhatsApp", calidad: "Media" },
  { nombre: "Pablo Serra", interes: "Implantes", origen: "Meta Ads", calidad: "Alta" },
] as const;

// ── Atención: conversación de WhatsApp y queja derivada ───────────────────────────────────────────
export const conversacionWhatsApp = [
  { de: "cliente", texto: "Hola, tengo cita mañana a las 10. ¿Puedo cambiarla a la tarde?", hora: "16:02" },
  { de: "agente", texto: "Hola, Rosa. Te escribe Sara, asistente de IA de Clínica Sol. Mañana tengo libre a las 17:00 o a las 18:30.", hora: "16:02" },
  { de: "cliente", texto: "A las 17:00 perfecto.", hora: "16:03" },
  { de: "agente", texto: "Hecho: mañana a las 17:00 con la Dra. Martí. Te mando un recordatorio una hora antes.", hora: "16:03" },
] as const;

export const quejaDerivada = {
  cliente: "Andrés Gil",
  texto: "Me cobrasteis dos veces la última revisión y nadie me contesta.",
  motivo: "Cobro duplicado: lo resuelve una persona",
  destino: "Recepción · Carmen",
} as const;

// ── Marketing: campañas y propuestas ──────────────────────────────────────────────────────────────
export const campanas = [
  { nombre: "Blanqueamiento · otoño", leads: 46, citas: 14, costeEur: 380 },
  { nombre: "Ortodoncia invisible", leads: 21, citas: 9, costeEur: 290 },
  { nombre: "Revisión familiar", leads: 33, citas: 6, costeEur: 210 },
] as const;

/** Ordenadas por impacto estimado (lo calcula Teo con los datos de arriba). */
export const propuestasCrecimiento = [
  { titulo: "Subir presupuesto de Ortodoncia invisible", impacto: "Alto", porque: "Más citas por lead: 43 % frente al 30 %" },
  { titulo: "Responder los leads de tarde en menos de 5 min", impacto: "Medio", porque: "Los de tarde convierten la mitad cuando esperan" },
  { titulo: "Pausar Revisión familiar los fines de semana", impacto: "Bajo", porque: "Casi no genera citas en sábado y domingo" },
] as const;

/** Lo que aprende Marketing de la cadena: qué leads acaban comprando. */
export const aprendizajeMarketing = "Los leads de Blanqueamiento que piden cita por la tarde compran el doble en esta campaña de ejemplo.";

// ── Operaciones · CRM ────────────────────────────────────────────────────────────────────────────
export const duplicados = {
  a: { nombre: "Laura Ferrer", telefono: "+34 600 000 145", correo: "—" },
  b: { nombre: "Laura Ferrer Ruiz", telefono: "—", correo: "laura.ferrer@correo.test" },
  fusion: { nombre: "Laura Ferrer Ruiz", telefono: "+34 600 000 145", correo: "laura.ferrer@correo.test" },
} as const;

export const fichasACompletar = [
  { nombre: "Jorge Almela", campo: "Etapa", valor: "Cita propuesta" },
  { nombre: "Nuria Bosch", campo: "Teléfono", valor: "+34 600 000 178" },
  { nombre: "Pablo Serra", campo: "Interés", valor: "Implantes" },
] as const;

// ── Dirección ────────────────────────────────────────────────────────────────────────────────────
export const resumenDelDia = {
  leads: 9,
  citas: 4,
  respuestaMediaMin: 4,
  pendientesAprobacion: 2,
  objetivos: [
    { departamento: "ventas", texto: "Confirmar las 4 citas de mañana" },
    { departamento: "marketing", texto: "Preparar 2 anuncios de ortodoncia" },
    { departamento: "operaciones", texto: "Cerrar las 3 fichas incompletas" },
  ] as { departamento: DepartmentId; texto: string }[],
};

// ── Aprobaciones ─────────────────────────────────────────────────────────────────────────────────
export const borradorCorreo = {
  para: leadPrincipal.correo,
  asunto: "Tu cita para el blanqueamiento",
  fraseOriginal: "Te esperamos el jueves.",
  fraseEditada: "Te esperamos el jueves a las 17:30; si te surge algo, contesta a este correo.",
  cuerpo: [
    "Hola, Elena:",
    "Gracias por escribirnos. El blanqueamiento son dos sesiones de una hora.",
    "{FRASE}",
    "Un saludo,",
    "Lucía · Clínica Sol (asistente de IA)",
  ],
} as const;

// ── Créditos (con las tarifas reales) ────────────────────────────────────────────────────────────
type Tarea = { agente: AgenteId; tipo: TipoDeTareaId; cuantas: number };

/** Tareas del mes de Clínica Sol, por agente y tipo. */
export const tareasDelMes: Tarea[] = [
  { agente: "lucia", tipo: "estandar", cuantas: 120 },
  { agente: "sara", tipo: "simple", cuantas: 310 },
  { agente: "ivan", tipo: "simple", cuantas: 140 },
  { agente: "teo", tipo: "estandar", cuantas: 18 },
  { agente: "atlas", tipo: "experta", cuantas: 8 },
];
export const traspasosDelMes = 135;
export const correosDelMes = 120;

export function consumoPorAgente() {
  const filas = tareasDelMes.map((t) => ({ agente: agentes[t.agente], creditos: t.cuantas * TIPOS_DE_TAREA[t.tipo].creditos }));
  return filas.sort((a, b) => b.creditos - a.creditos);
}

export const consumoDelMes =
  consumoPorAgente().reduce((n, f) => n + f.creditos, 0) +
  traspasosDelMes * CONSUMOS_FIJOS.traspaso +
  correosDelMes * CONSUMOS_FIJOS.correo;

/** Saldo inicial del mes y la tarea que se descuenta en el vídeo de créditos. */
export const saldoInicial = 8_000;
export const tareaQueDescuenta = { agente: agentes.lucia, tipo: "estandar" as TipoDeTareaId, creditos: TIPOS_DE_TAREA.estandar.creditos };

// ── Memoria ──────────────────────────────────────────────────────────────────────────────────────
export const memoriaContacto = {
  contacto: leadPrincipal.nombre,
  nodos: [
    { tipo: "dato", texto: "Prefiere citas por la tarde" },
    { tipo: "acuerdo", texto: "Cita jueves 17:30" },
    { tipo: "objecion", texto: "Le preocupa la sensibilidad" },
    { tipo: "pendiente", texto: "Enviar recordatorio el miércoles" },
    { tipo: "externo", texto: "Lead de Meta Ads · otoño" },
    { tipo: "aprendizaje", texto: "Responde mejor a mensajes cortos" },
  ],
} as const;
