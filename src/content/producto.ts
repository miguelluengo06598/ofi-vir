/**
 * /producto, «La oficina por dentro». El recorrido enseña la interfaz real (componentes de la oficina con
 * datos de ejemplo) y resalta una parte en cada paso. Los créditos de ejemplo salen de las tarifas reales.
 */
import type { VideoId } from "@/config/videos";
import { CONSUMOS_FIJOS, TIPOS_DE_TAREA } from "@/lib/creditos/tarifas";
import type { ResumenCreditos } from "@/lib/creditos/tipos";

export type VistaOficina = "oficina" | "departamento" | "mensajes" | "aprobaciones" | "memoria" | "directo" | "creditos";

export type PasoRecorrido = { vista: VistaOficina; titulo: string; texto: string; foco: string; video?: VideoId };

export const recorridoProducto: PasoRecorrido[] = [
  {
    vista: "oficina",
    titulo: "La oficina",
    texto: "Tus departamentos y sus agentes, con su estado en tiempo real: quién trabaja, quién espera tu aprobación y cuánto ha gastado hoy cada equipo.",
    foco: "Estado de cada agente",
  },
  {
    vista: "departamento",
    titulo: "Panel de departamento",
    texto: "Abre un departamento y ves sus métricas, su equipo y todo lo que ha enviado y recibido de los demás departamentos.",
    foco: "Enviado y recibido",
  },
  {
    vista: "mensajes",
    titulo: "Mensajes",
    texto: "Chatea con cualquier agente como con alguien de tu equipo y consulta su ficha: qué hace, qué ha hecho y cuánto cuesta.",
    foco: "Conversación con un agente",
  },
  {
    vista: "aprobaciones",
    titulo: "Aprobaciones",
    texto: "Todo lo sensible espera tu visto bueno, con vista previa: lees el correo tal y como saldrá, lo editas si quieres y lo apruebas.",
    foco: "Vista previa antes de enviar",
    video: "aprobaciones",
  },
  {
    vista: "memoria",
    titulo: "Memoria",
    texto: "Lo que sabe tu oficina, como una constelación de contactos, acuerdos y pendientes. Cualquier agente sabe lo que ha hecho el resto.",
    foco: "Memoria compartida",
    video: "memoria",
  },
  {
    vista: "directo",
    titulo: "En directo",
    texto: "Los traspasos entre departamentos según ocurren: quién pasa qué a quién, y por qué empezó cada cadena.",
    foco: "Traspasos en directo",
  },
  {
    vista: "creditos",
    titulo: "Créditos",
    texto: "Tu saldo, el consumo de cada agente y el tope de gasto que tú fijas. Sabes lo que cuesta cada tarea antes de que empiece.",
    foco: "Saldo y consumo",
    video: "creditos",
  },
];

// ── Créditos de ejemplo (Clínica Sol, ficticia) ────────────────────────────────────────────────────
const tareas = [
  { nombre: "Lucía Ramos", departamento: "Ventas", tipo: "estandar", cuantas: 120 },
  { nombre: "Sofía Navarro", departamento: "Atención al cliente", tipo: "simple", cuantas: 310 },
  { nombre: "Nuria Campos", departamento: "Operaciones · CRM", tipo: "simple", cuantas: 140 },
  { nombre: "Álvaro Ríos", departamento: "Marketing", tipo: "estandar", cuantas: 18 },
  { nombre: "Elena Bravo", departamento: "Dirección", tipo: "experta", cuantas: 8 },
] as const;

const porAgente = tareas
  .map((t) => ({ agenteId: null, nombre: t.nombre, creditos: t.cuantas * TIPOS_DE_TAREA[t.tipo].creditos }))
  .sort((a, b) => b.creditos - a.creditos);
const traspasos = 135 * CONSUMOS_FIJOS.traspaso;
const correos = 120 * CONSUMOS_FIJOS.correo;
const totalMes = porAgente.reduce((n, a) => n + a.creditos, 0) + traspasos + correos;

export const resumenCreditosEjemplo: ResumenCreditos = {
  estadoOficina: { estado: "activa", puedeEjecutarAgentes: true },
  saldo: { disponible: 8_000, reservado: TIPOS_DE_TAREA.estandar.creditos, enLotes: 8_010, consumidosEsteMes: totalMes },
  lotes: [{ creditosRestantes: 8_010, caducaEn: "2027-10-01T00:00:00Z" }],
  consumoMes: {
    total: totalMes,
    porAgente,
    porDepartamento: tareas.map((t) => ({ departamentoId: null, nombre: t.departamento, creditos: t.cuantas * TIPOS_DE_TAREA[t.tipo].creditos })),
    porTipoDeTarea: (["simple", "estandar", "experta"] as const).map((tipo) => ({
      concepto: TIPOS_DE_TAREA[tipo].concepto,
      tipo,
      creditos: tareas.filter((t) => t.tipo === tipo).reduce((n, t) => n + t.cuantas * TIPOS_DE_TAREA[tipo].creditos, 0),
    })),
  },
  rutinas: { activas: 0, costeMensualEstimado: 0, detalle: [] },
  ajustes: { topeMensualCreditos: 10_000, recargaAuto: { activa: false, umbral: null, packId: null }, bonoMensualPackId: null, bonoProximaRenovacionEn: null, pruebaUsada: true },
  packs: [],
};
