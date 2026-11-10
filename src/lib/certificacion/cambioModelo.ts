/**
 * Cambio del modelo de IA de la plataforma: todos los agentes activos repiten el examen técnico (CLAUDE.md, «Recertificación»).
 * Crea una solicitud «cambio_modelo» por agente (sobre su versión certificada), ejecuta el examen con el modelo nuevo y devuelve un
 * informe de los que suspenden. Aprobar no cambia la certificación; suspender no pausa al agente: IDESIE decide con el informe.
 * Solo servidor. Lo lanza `npm run certificacion:cambio-modelo -- --modelo=<id>`.
 */
import { ejecutarExamen, type DepsExamen } from "./examen.ts";

export type ResultadoAgente = {
  companyId: string; agentId: string; nombre: string; version: number;
  resultado: "aprobado" | "suspendido" | "omitido" | "error";
  notaGlobal: number | null;
  /** Bloques suspendidos, con su resumen. */
  bloquesSuspendidos: { bloque: string; nota: number; resumen: string }[];
  detalle: string | null;
};
export type InformeCambioDeModelo = { modelo: string; fecha: string; total: number; aprobados: number; suspendidos: ResultadoAgente[]; omitidos: ResultadoAgente[]; errores: ResultadoAgente[]; agentes: ResultadoAgente[] };

export async function examenPorCambioDeModelo(deps: DepsExamen, o: { modelo: string; companyId?: string; ahora?: Date; alAvanzar?: (r: ResultadoAgente) => void }): Promise<InformeCambioDeModelo> {
  const { db } = deps;
  let q = db.from("agents").select("id, company_id, name, version_certificada, template_id, template_version, companies!inner(es_examen)").eq("estado", "activo").not("version_certificada", "is", null).eq("companies.es_examen", false).order("company_id");
  if (o.companyId) q = q.eq("company_id", o.companyId);
  const { data, error } = await q;
  if (error) throw new Error(`No se pudieron leer los agentes activos: ${error.message}`);

  const agentes: ResultadoAgente[] = [];
  for (const a of data ?? []) {
    const base = { companyId: a.company_id as string, agentId: a.id as string, nombre: a.name as string, version: a.version_certificada as number, notaGlobal: null, bloquesSuspendidos: [], detalle: null };
    let r: ResultadoAgente;
    const env = await db.rpc("certificacion_enviar", {
      p_company_id: a.company_id, p_agent_id: a.id, p_user_id: null, p_tipo: "cambio_modelo", p_via: "completa",
      p_resumen: `Cambio del modelo de IA de la plataforma a ${o.modelo}: el agente repite el examen técnico.`, p_modelo_examen: o.modelo,
    });
    if (env.error) {
      // 23505: ya tiene una solicitud abierta (un cambio en certificación); se examina cuando esa termine.
      r = { ...base, resultado: "omitido", detalle: env.error.code === "23505" ? "Tiene otra solicitud de certificación en curso." : env.error.message };
    } else {
      try {
        const { resultado } = await ejecutarExamen(deps, { companyId: a.company_id as string, requestId: env.data as string });
        r = { ...base, resultado: resultado.resultado, notaGlobal: resultado.notaGlobal, bloquesSuspendidos: resultado.bloques.filter((b) => !b.aprobado).map((b) => ({ bloque: b.nombre, nota: b.nota, resumen: b.resumen })) };
      } catch (e) {
        r = { ...base, resultado: "error", detalle: e instanceof Error ? e.message.slice(0, 300) : "error desconocido" };
      }
    }
    agentes.push(r);
    o.alAvanzar?.(r);
  }
  return {
    modelo: o.modelo, fecha: (o.ahora ?? new Date()).toISOString(), total: agentes.length, aprobados: agentes.filter((a) => a.resultado === "aprobado").length,
    suspendidos: agentes.filter((a) => a.resultado === "suspendido"), omitidos: agentes.filter((a) => a.resultado === "omitido"), errores: agentes.filter((a) => a.resultado === "error"), agentes,
  };
}

/** El informe en texto (Markdown), para guardarlo o pegarlo donde haga falta. */
export function informeCambioDeModeloEnTexto(i: InformeCambioDeModelo): string {
  const fila = (a: ResultadoAgente) => `- **${a.nombre}** (empresa ${a.companyId}, agente ${a.agentId}, versión ${a.version})${a.notaGlobal != null ? ` · nota ${a.notaGlobal}/100` : ""}${a.detalle ? ` · ${a.detalle}` : ""}${a.bloquesSuspendidos.map((b) => `\n  - ${b.bloque}: ${b.nota}/10. ${b.resumen}`).join("")}`;
  const seccion = (titulo: string, l: ResultadoAgente[]) => (l.length ? `\n## ${titulo} (${l.length})\n${l.map(fila).join("\n")}\n` : "");
  return `# Examen técnico por cambio de modelo de IA\n\nModelo nuevo: \`${i.modelo}\` · Fecha: ${i.fecha}\n\nAgentes activos examinados: ${i.total} · aprobados: ${i.aprobados} · suspendidos: ${i.suspendidos.length} · omitidos: ${i.omitidos.length} · con error: ${i.errores.length}\n${seccion("Suspenden con el modelo nuevo", i.suspendidos) || "\nNingún agente suspende con el modelo nuevo.\n"}${seccion("Omitidos", i.omitidos)}${seccion("Con error (repetir)", i.errores)}`;
}
