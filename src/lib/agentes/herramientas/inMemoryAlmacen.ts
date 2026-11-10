import { randomUUID } from "node:crypto";
import { ToolError } from "../../agents/tools.ts";
import { evaluarCadena, type TraspasoDeCadena } from "../traspasos/cadena.ts";
import type { AlmacenHerramientas, LlamadaRegistrada, NuevoTraspaso, Permiso, ResultadoTraspaso, TraspasoConfigurado } from "./tipos.ts";

/** Almacén en memoria para los tests: misma forma que el de Supabase, y cada consulta filtra por empresa igual que él. */
export class InMemoryAlmacenHerramientas implements AlmacenHerramientas {
  tools: { companyId: string; agentId: string; toolId: string; permiso: Permiso; limiteDiario: number | null }[] = [];
  conexiones: { companyId: string; proveedor: string }[] = [];
  aprobaciones = new Map<string, { companyId: string; agentId: string; kind: string; titulo: string; detalle: string; payload: Record<string, unknown>; status: "pending" | "approved" | "rejected" }>();
  llamadas: (LlamadaRegistrada & { companyId: string; creadoEn: Date })[] = [];
  tareasHumanas: { id: string; companyId: string; agentId: string; taskId: string | null; contactId: string | null; titulo: string; contexto: string; urgencia: string }[] = [];
  traspasos: (TraspasoConfigurado & { companyId: string; agentIdOrigen: string })[] = [];
  traspasosCreados: { companyId: string; fromAgentId: string; toAgentId: string; kind: string; summary: string; card: { label: string; value: string }[]; contactId: string | null; tipo?: string; ficha?: Record<string, string | number> }[] = [];
  ahora: () => Date = () => new Date();

  async herramientaDeAgente(companyId: string, agentId: string, toolId: string) {
    const t = this.tools.find((x) => x.companyId === companyId && x.agentId === agentId && x.toolId === toolId);
    return t ? { permiso: t.permiso, limiteDiario: t.limiteDiario } : null;
  }
  async herramientasDeAgente(companyId: string, agentId: string) {
    return this.tools.filter((x) => x.companyId === companyId && x.agentId === agentId).map(({ toolId, permiso, limiteDiario }) => ({ toolId, permiso, limiteDiario }));
  }
  async integracionConectada(companyId: string, proveedor: string) {
    return this.conexiones.some((c) => c.companyId === companyId && c.proveedor === proveedor);
  }
  async contarLlamadasDesde(companyId: string, agentId: string, toolId: string, desde: Date) {
    return this.llamadas.filter((l) => l.companyId === companyId && l.agentId === agentId && l.toolId === toolId && !l.esSimulacion
      && (l.resultado === "ok" || l.resultado === "pendiente_aprobacion") && l.creadoEn >= desde).length;
  }
  async registrarLlamada(companyId: string, l: LlamadaRegistrada) {
    this.llamadas.push({ ...l, companyId, creadoEn: this.ahora() });
  }

  async crearAprobacion(companyId: string, a: { agentId: string; kind: "spend" | "other"; titulo: string; detalle: string; payload: Record<string, unknown> }) {
    const id = randomUUID();
    this.aprobaciones.set(id, { companyId, ...a, status: "pending" });
    return id;
  }
  private aprobacionDe(companyId: string, id: string) {
    const a = this.aprobaciones.get(id);
    return a && a.companyId === companyId ? a : null;
  }
  async leerAprobacion(companyId: string, approvalId: string) {
    const a = this.aprobacionDe(companyId, approvalId);
    return a ? { status: a.status, agentId: a.agentId, payload: a.payload } : null;
  }
  async llamadaPendiente(companyId: string, approvalId: string) {
    const l = this.llamadas.find((x) => x.companyId === companyId && x.approvalId === approvalId && x.resultado === "pendiente_aprobacion");
    return l ? { toolId: l.toolId, agentId: l.agentId, taskId: l.taskId } : null;
  }
  async consumirAprobacion(companyId: string, c: { approvalId: string; agentId: string; taskId: string | null; toolId: string; decision: "aprobada" | "rechazada" }) {
    if (this.llamadas.some((l) => l.companyId === companyId && l.approvalId === c.approvalId && (l.resultado === "aprobada" || l.resultado === "rechazada"))) return false;
    await this.registrarLlamada(companyId, { taskId: c.taskId, agentId: c.agentId, toolId: c.toolId, entradaResumen: "", resultado: c.decision, detalle: "", permiso: "aprobacion", duracionMs: 0, approvalId: c.approvalId, esSimulacion: false });
    return true;
  }

  async crearTareaHumana(companyId: string, t: { agentId: string; taskId: string | null; contactId: string | null; titulo: string; contexto: string; urgencia: "baja" | "normal" | "alta" }) {
    const id = randomUUID();
    this.tareasHumanas.push({ id, companyId, ...t });
    return id;
  }
  async traspasosConfigurados(companyId: string, agentIdOrigen: string) {
    return this.traspasos.filter((t) => t.companyId === companyId && t.agentIdOrigen === agentIdOrigen);
  }
  /** Créditos cobrados por traspasos (para las pruebas). */
  cobros: { companyId: string; creditos: number; agentId: string }[] = [];
  saldo = Infinity;
  private cadenas = new Map<string, { historial: TraspasoDeCadena[] }>();
  private cadenaDeTarea = new Map<string, string>();
  tareasDeTraspaso: { companyId: string; id: string; agentId: string; chainId: string; instruccion: string }[] = [];
  async crearTraspasoDirecto(companyId: string, h: NuevoTraspaso): Promise<ResultadoTraspaso> {
    const cfg = this.traspasos.find((t) => t.companyId === companyId && t.agentIdOrigen === h.fromAgentId && t.agenteDestinoId === h.toAgentId);
    if (!cfg || cfg.tipoTraspaso !== h.tipo) throw new Error("TRASPASO_NO_CONFIGURADO");
    const chainId = (h.originTaskId && this.cadenaDeTarea.get(h.originTaskId)) || randomUUID();
    const cadena = this.cadenas.get(chainId) ?? { historial: [] };
    this.cadenas.set(chainId, cadena);
    const d = evaluarCadena(cadena.historial, { fromAgentId: h.fromAgentId, toAgentId: h.toAgentId, fichaHash: h.fichaHash }, h.maxCadena);
    if (d.resultado !== "creado") return { resultado: d.resultado, motivo: d.motivo, chainId };
    if (this.saldo < h.creditos) throw new ToolError("No hay créditos suficientes para hacer el traspaso. Pásalo a una persona.");
    this.saldo -= h.creditos;
    this.cobros.push({ companyId, creditos: h.creditos, agentId: h.fromAgentId });
    cadena.historial.push({ fromAgentId: h.fromAgentId, toAgentId: h.toAgentId, fichaHash: h.fichaHash });
    const taskId = randomUUID();
    this.cadenaDeTarea.set(taskId, chainId);
    this.tareasDeTraspaso.push({ companyId, id: taskId, agentId: h.toAgentId, chainId, instruccion: h.instruccion });
    this.traspasosCreados.push({ companyId, fromAgentId: h.fromAgentId, toAgentId: h.toAgentId, kind: h.kind, summary: h.summary, card: h.card, contactId: h.contactId, tipo: h.tipo, ficha: h.ficha });
    return { resultado: "creado", handoffId: randomUUID(), chainId, posicion: cadena.historial.length, taskId, toAgentName: cfg.agenteDestinoNombre };
  }
}
