/**
 * Reglas de cada agente, aplicadas en el SERVIDOR (no solo en las instrucciones):
 *  - al lanzar la tarea (`alLanzar`): tope de créditos del mes y horario (con «no responder», la tarea se aplaza);
 *  - en el ejecutor de herramientas (`reglasDelEjecutor`): horario, límite diario de mensajes externos (lo siguiente pasa a aprobación
 *    y se avisa a la empresa), tope de créditos en herramientas de pago y aviso de IA en el primer mensaje a cada persona por canal.
 * El idioma de respuesta solo puede ir en las instrucciones (el código no puede comprobar en qué idioma redacta el modelo).
 */
import type { MemoryService } from "../../memory/service.ts";
import type { MemoryStore } from "../../memory/store.ts";
import type { AgentInfo } from "../../agents/store.ts";
import type { ReglasAgente } from "../instrucciones.ts";
import { inicioDelDia } from "../herramientas/ejecutor.ts";
import type { ContextoEjecucion, DecisionReglas, Herramienta } from "../herramientas/tipos.ts";
import { componerMensaje, decidirEnvio, decidirLanzamiento, type DecisionLanzamiento } from "./evaluar.ts";
import { inicioDelMes } from "./horario.ts";
import { CANALES_DE_HERRAMIENTA, HERRAMIENTAS_DE_MENSAJE, NOMBRE_CANAL, REGLAS_POR_DEFECTO, type AlmacenReglas, type Canal } from "./tipos.ts";

export type DepsReglas = {
  almacen: AlmacenReglas;
  memory: MemoryService;
  memStore: Pick<MemoryStore, "findContactByEmail" | "getContact" | "findNodeByTitle">;
  log?: Pick<Console, "warn" | "error">;
};

/** Título del nodo de memoria que dice «a esta persona ya se le avisó de que es una IA por este canal». */
export const tituloAvisoIa = (canal: Canal) => `Aviso de IA dado (${NOMBRE_CANAL[canal]})`;

export function crearServicioReglas(deps: DepsReglas) {
  const { almacen, memory, memStore } = deps;
  const log = deps.log ?? console;

  const reglasDe = async (companyId: string, agentId: string): Promise<ReglasAgente> => (await almacen.reglasDe(companyId, agentId)) ?? { ...REGLAS_POR_DEFECTO };

  const avisarTope = (companyId: string, agent: Pick<AgentInfo, "id" | "name">, r: ReglasAgente, consumidos: number, ahora: Date) =>
    almacen.avisarEmpresa(companyId, {
      agentId: agent.id, tipo: "tope_creditos_agente", desde: inicioDelMes(ahora, r.zonaHoraria),
      titulo: `${agent.name} ha alcanzado su tope de créditos del mes`,
      cuerpo: `${agent.name} lleva ${consumidos} de ${r.topeCreditosMes} créditos este mes y no trabajará hasta el mes que viene o hasta que subas el tope en sus reglas.`,
    });

  return {
    reglasDe,

    /** Al lanzar una tarea. Si bloquea por tope de créditos, avisa a la empresa (una vez al mes por agente). */
    async alLanzar(companyId: string, agent: Pick<AgentInfo, "id" | "name">, o: { ahora: Date; esMensajeExterno: boolean }): Promise<DecisionLanzamiento & { reglas: ReglasAgente }> {
      const r = await reglasDe(companyId, agent.id);
      const creditosMes = r.topeCreditosMes === null ? 0 : await almacen.creditosConsumidosDesde(companyId, agent.id, inicioDelMes(o.ahora, r.zonaHoraria));
      const d = decidirLanzamiento(r, { ahora: o.ahora, esMensajeExterno: o.esMensajeExterno, creditosMes });
      if (d.accion === "bloquear" && d.causa === "tope_creditos") await avisarTope(companyId, agent, r, creditosMes, o.ahora);
      return { ...d, reglas: r };
    },

    /** Como `alLanzar`, pero sin efectos (no avisa a la empresa): para el simulador. */
    async previsualizar(companyId: string, agent: Pick<AgentInfo, "id" | "name">, o: { ahora: Date; esMensajeExterno: boolean }): Promise<DecisionLanzamiento & { reglas: ReglasAgente }> {
      const r = await reglasDe(companyId, agent.id);
      const creditosMes = r.topeCreditosMes === null ? 0 : await almacen.creditosConsumidosDesde(companyId, agent.id, inicioDelMes(o.ahora, r.zonaHoraria));
      return { ...decidirLanzamiento(r, { ahora: o.ahora, esMensajeExterno: o.esMensajeExterno, creditosMes }), reglas: r };
    },

    /** El gancho `ctx.reglas` del ejecutor de herramientas. */
    reglasDelEjecutor() {
      return async (ctx: ContextoEjecucion, h: Herramienta, entrada: unknown, op: { aprobada: boolean }): Promise<DecisionReglas> => {
        const ahora = (ctx.ahora ?? (() => new Date()))();
        const r = await reglasDe(ctx.companyId, ctx.agent.id);

        // Tope de créditos del mes: frena toda herramienta que cuesta créditos (aunque venga de una aprobación).
        if (r.topeCreditosMes !== null && h.costeCreditos !== null) {
          const consumidos = await almacen.creditosConsumidosDesde(ctx.companyId, ctx.agent.id, inicioDelMes(ahora, r.zonaHoraria));
          if (consumidos >= r.topeCreditosMes) {
            await avisarTope(ctx.companyId, ctx.agent, r, consumidos, ahora);
            return { bloquear: `Este agente ha alcanzado su tope de créditos de este mes (${r.topeCreditosMes}): no puedes usar «${h.nombre}». Resume lo ocurrido y termina.` };
          }
        }

        const c = CANALES_DE_HERRAMIENTA[h.id];
        if (!c) return null;   // el resto de reglas solo afecta a lo que escribe a personas de fuera

        const datos = (entrada ?? {}) as Record<string, unknown>;
        const texto = typeof datos[c.campoTexto] === "string" ? (datos[c.campoTexto] as string) : "";

        // Quién es la persona, para saber si ya se le avisó de que es una IA.
        let contacto: { id: string; name: string; email: string } | null = null;
        if (c.canal === "correo" && typeof datos[c.campoDestino] === "string") contacto = await memStore.findContactByEmail(ctx.companyId, datos[c.campoDestino] as string);
        else if (ctx.task.contactId) contacto = await memStore.getContact(ctx.companyId, ctx.task.contactId);
        const avisoIaDado = contacto ? (await memStore.findNodeByTitle(ctx.companyId, contacto.id, "dato", tituloAvisoIa(c.canal))) !== null : false;

        let enviadosHoy = 0;
        if (r.maxMensajesDia !== null && !op.aprobada) {
          const desde = inicioDelDia(ahora, r.zonaHoraria);
          for (const id of HERRAMIENTAS_DE_MENSAJE) enviadosHoy += await ctx.almacen.contarLlamadasDesde(ctx.companyId, ctx.agent.id, id, desde);
        }

        const d = decidirEnvio(r, { ahora, enviadosHoy, aprobada: op.aprobada, respondeAExterno: ctx.externalContent, avisoIaDado });
        if (d.bloquear) return { bloquear: d.bloquear };

        const compuesto = componerMensaje(texto, { avisoIa: d.avisoIa, fueraHorario: d.fueraHorario });
        const salida: Exclude<DecisionReglas, string | null> = {};
        if (compuesto.texto !== texto) salida.entrada = { ...datos, [c.campoTexto]: compuesto.texto };

        if (d.limiteAlcanzado) {
          salida.forzarAprobacion = `Límite diario alcanzado: ${ctx.agent.name} ya ha enviado ${enviadosHoy} de ${r.maxMensajesDia} mensajes externos hoy. Este necesita aprobación.`;
          await almacen.avisarEmpresa(ctx.companyId, {
            agentId: ctx.agent.id, tipo: "limite_mensajes_agente", desde: inicioDelDia(ahora, r.zonaHoraria),
            titulo: `${ctx.agent.name} ha llegado a su límite diario de mensajes`,
            cuerpo: `${ctx.agent.name} ya ha enviado ${enviadosHoy} de ${r.maxMensajesDia} mensajes a clientes hoy. Los siguientes quedan pendientes de tu aprobación.`,
          });
        }

        // Anota en la memoria que ya se avisó (solo si hay un contacto al que atarlo y el mensaje llevaba el aviso).
        if (d.avisoIa && contacto) {
          const quien = contacto;
          salida.alTerminarBien = async () => {
            await memory.guardarRecuerdo(ctx.companyId, {
              agentId: ctx.agent.id,
              contacto: { nombre: quien.name, email: quien.email },
              nodos: [{ clave: "aviso", tipo: "dato", titulo: tituloAvisoIa(c.canal), contenido: `${ctx.agent.name} avisó a esta persona de que es un asistente de IA por ${NOMBRE_CANAL[c.canal]} (${ahora.toISOString().slice(0, 10)}).`, externo: false, confianza: 1 }],
              conexiones: [],
            }, { permitirSinVector: true, ...(ctx.task.id ? { tareaOrigen: ctx.task.id } : {}) });
          };
        } else if (d.avisoIa && !contacto) {
          log.warn("[reglas] aviso de IA: no hay contacto al que anotar el aviso; se repetirá en el siguiente mensaje.");
        }
        return Object.keys(salida).length ? salida : null;
      };
    },
  };
}
export type ServicioReglas = ReturnType<typeof crearServicioReglas>;
