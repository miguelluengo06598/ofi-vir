import { z } from "zod";
import { ToolError } from "../../agents/tools.ts";
import { CONSUMOS_FIJOS } from "../../creditos/tarifas.ts";
import { normalizeKey } from "../../memory/text.ts";
import { MAX_TRASPASOS_POR_CADENA } from "../traspasos/cadena.ts";
import { describirFicha, esTipoDeTraspaso, fichaParaMostrar, huellaDeFicha, TIPO_EN_OFICINA, TIPOS_DE_TRASPASO, validarFicha } from "../traspasos/fichas.ts";
import { instruccionDeTraspaso } from "../traspasos/instruccion.ts";
import { neutralizar } from "../../email/untrusted.ts";
import { definir, type ContextoEjecucion } from "./tipos.ts";

const FICHAS_PARA_CLAUDE = TIPOS_DE_TRASPASO.map((t) => `${t}: ${describirFicha(t)}`).join(" · ");

/** Resuelve el destino configurado, valida la ficha contra el esquema de su tipo y monta la tarea de entrada. Lanza ToolError (con el motivo para Claude). */
async function prepararTraspaso(ctx: ContextoEjecucion, i: { agente_destino: string; resumen: string; ficha: Record<string, string | number> }) {
      const configurados = await ctx.almacen.traspasosConfigurados(ctx.companyId, ctx.agent.id);
      const quiere = normalizeKey(i.agente_destino);
      const destino = configurados.find((c) => normalizeKey(c.agenteDestinoNombre) === quiere || c.agenteDestinoSlug === quiere)
        ?? configurados.find((c) => normalizeKey(c.agenteDestinoNombre).includes(quiere));
      if (!destino) {
        throw new ToolError(configurados.length
          ? `No tienes configurado un traspaso hacia «${i.agente_destino.slice(0, 40)}». Puedes pasar trabajo a: ${configurados.map((c) => `${c.agenteDestinoNombre} (${c.tipoTraspaso}: ${c.condicion})`).join("; ")}.`
          : "No tienes configurado ningún traspaso a otros agentes.");
      }
      const tipo = destino.tipoTraspaso;
      if (!esTipoDeTraspaso(tipo)) throw new ToolError(`El traspaso hacia ${destino.agenteDestinoNombre} tiene un tipo no válido («${tipo}»). Avisa a una persona.`);

      // La ficha se valida contra el esquema de SU tipo. Si no es válida, no se crea nada y Claude recibe el error para corregirla.
      const v = validarFicha(tipo, i.ficha);
      if (!v.ok) throw new ToolError(v.error);

      const card = fichaParaMostrar(tipo, v.ficha);
      const resumen = neutralizar(i.resumen);
      const instruccion = instruccionDeTraspaso({ origen: ctx.agent.name, tipo, resumen, card, externo: ctx.externalContent });
  return { destino, tipo, ficha: v.ficha, card, resumen, instruccion };
}

export const HERRAMIENTAS_INTERNAS = [
  definir({
    id: "pasar_a_agente",
    nombre: "Pasar trabajo a otro agente",
    descripcionClaude: `Pasa trabajo a otro agente con el que tu empresa ha configurado un traspaso. Indica su nombre, un resumen de una línea y la ficha con los datos, que debe ser un objeto con los campos del tipo de traspaso configurado (* = obligatorio). Fichas por tipo → ${FICHAS_PARA_CLAUDE}. Si la ficha no es válida recibirás el error para corregirla.`,
    descripcionEmpresa: "Entrega un caso a otro agente de la oficina, solo si habéis configurado ese traspaso. El agente destino recibe una tarea con la ficha. Cuesta 1 crédito.",
    entrada: z.object({
      agente_destino: z.string().trim().min(1).max(100).describe("Nombre del agente al que pasas el trabajo"),
      resumen: z.string().trim().min(1).max(200).describe("Una línea con lo que se pasa"),
      ficha: z.record(z.string(), z.union([z.string(), z.number()])).default({}).describe("Objeto con los campos del tipo de traspaso (según el tipo configurado hacia ese agente)"),
    }),
    salida: z.object({ mensaje: z.string() }),
    categoria: "interna", sensibilidad: "escritura", integracion: null, costeCreditos: "traspaso",
    async ejecutar(ctx, i) {
      const { destino, tipo, ficha, card, resumen, instruccion } = await prepararTraspaso(ctx, i);
      let r;
      try {
        r = await ctx.almacen.crearTraspasoDirecto(ctx.companyId, {
          fromAgentId: ctx.agent.id, toAgentId: destino.agenteDestinoId, tipo, kind: TIPO_EN_OFICINA[tipo], summary: resumen, card, ficha,
          fichaHash: huellaDeFicha(tipo, ficha), contactId: ctx.task.contactId, originTaskId: ctx.task.id || null, instruccion,
          creditos: CONSUMOS_FIJOS.traspaso, maxCadena: MAX_TRASPASOS_POR_CADENA,
        });
      } catch (e) {
        if (e instanceof ToolError) throw e;
        throw new ToolError(`No se pudo hacer el traspaso a ${destino.agenteDestinoNombre}.`);
      }
      if (r.resultado !== "creado") {
        throw new ToolError(`Traspaso cortado: ${r.motivo}. No lo repitas: resume lo ocurrido y termina; la empresa ya ha sido avisada.`);
      }
      return { mensaje: `Traspaso creado: ${r.toAgentName} lo recibe como tarea (${CONSUMOS_FIJOS.traspaso} crédito).` };
    },
    // Valida de verdad (destino configurado y ficha), pero no crea ni cobra nada.
    async simular(ctx, i) {
      const { destino, tipo } = await prepararTraspaso(ctx, i);
      return { mensaje: `[Simulación] Traspaso (${tipo}) a ${destino.agenteDestinoNombre} «creado». No se ha creado nada real.` };
    },
    aTexto: (s) => s.mensaje,
  }),
  definir({
    id: "pedir_aprobacion",
    nombre: "Pedir aprobación a una persona",
    descripcionClaude: "Pide a una persona de la empresa que decida algo antes de seguir (un descuento, una excepción, una duda). La tarea queda en espera hasta que responda.",
    descripcionEmpresa: "Cuando el agente tiene una duda que debe decidir una persona, os la plantea en Aprobaciones.",
    entrada: z.object({
      asunto: z.string().trim().min(1).max(200).describe("Qué hay que decidir, en una línea"),
      detalle: z.string().trim().min(1).max(1500).describe("Contexto y lo que propones"),
    }),
    salida: z.object({ aprobacion_id: z.string(), mensaje: z.string() }),
    categoria: "interna", sensibilidad: "escritura", integracion: null, costeCreditos: null,
    creaSuPropiaAprobacion: true, pausaTarea: true, permitidaEnTareaSospechosa: true,
    async ejecutar(ctx, i) {
      const id = await ctx.almacen.crearAprobacion(ctx.companyId, {
        agentId: ctx.agent.id, kind: "other", titulo: i.asunto, detalle: i.detalle,
        payload: { tipo: "consulta", tarea_id: ctx.task.id, agente: ctx.agent.name },
      });
      return { aprobacion_id: id, mensaje: "Consulta enviada a una persona. Queda pendiente de su respuesta: no sigas con esto y resume lo que has hecho." };
    },
    simular: () => ({ aprobacion_id: "sim-aprobacion", mensaje: "[Simulación] Consulta «enviada» a una persona. No se ha creado nada real." }),
    aTexto: (s) => s.mensaje,
  }),
];
