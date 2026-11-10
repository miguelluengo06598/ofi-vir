import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PanelSancionCalidad } from "@/components/admin/certificacion/PanelSancionCalidad";
import { Etiqueta, Seccion, Tabla } from "@/components/admin/certificacion/piezas";
import { sesionRevisor } from "@/lib/admin/certificacion/acceso";
import { dbAdminDesdeEntorno } from "@/lib/admin/entorno";

const NOMBRES: Record<string, string> = { valoraciones_negativas: "Valoraciones negativas", aprobaciones_rechazadas: "Aprobaciones rechazadas", alertas_operativas_recurrentes: "Alertas de margen o pasos", muestreo_fallido: "Muestreo suspendido", accion_fuera_permisos: "Acción fuera de permisos", seguridad_grave: "Fallo grave de seguridad" };

/** Con cacheComponents, lo que lee cabeceras va dentro de Suspense (se calcula en cada petición). */
export default function Page() {
  return <Suspense fallback={<p role="status" className="text-body text-ink-2">Cargando el control de calidad…</p>}><Calidad /></Suspense>;
}

async function Calidad() {
  const db = dbAdminDesdeEntorno(); const sesion = db ? await sesionRevisor(await headers(), db) : null;
  if (!db || !sesion) notFound();
  const [{ data: alerts }, { data: samples }] = await Promise.all([
    db.from("internal_alerts").select("id, tipo, company_id, agent_id, detalle, creado_en").in("tipo", Object.keys(NOMBRES)).order("creado_en", { ascending: false }).limit(100),
    db.from("quality_samples").select("id, company_id, agent_id, score, rubric, evidence_anonymized, sampled_at, evaluated_at").eq("status", "review").order("evaluated_at", { ascending: false }).limit(100),
  ]);
  const agentIds = [...new Set([...(alerts ?? []).map((x) => x.agent_id as string | null), ...(samples ?? []).map((x) => x.agent_id as string)].filter((x): x is string => !!x))];
  const companyIds = [...new Set([...(alerts ?? []).map((x) => x.company_id as string), ...(samples ?? []).map((x) => x.company_id as string)])];
  const [{ data: agents }, { data: companies }] = await Promise.all([
    agentIds.length ? db.from("agents").select("id, company_id, name, estado").in("id", agentIds) : Promise.resolve({ data: [] as never[] }),
    companyIds.length ? db.from("companies").select("id, name").in("id", companyIds) : Promise.resolve({ data: [] as never[] }),
  ]);
  const byAgent = new Map((agents ?? []).map((a) => [a.id as string, a])); const byCompany = new Map((companies ?? []).map((c) => [c.id as string, c.name as string]));
  return <>
    <header><h1 className="text-h1">Control continuo de calidad</h1><p className="text-body text-ink-2">Muestras reales anonimizadas, señales acumuladas y medidas manuales. Las notas internas y datos de clientes no salen de este panel.</p></header>
    <Seccion id="muestras" titulo={`Cola de muestras a revisión (${samples?.length ?? 0})`} nota="Solo llegan aquí las tareas con nota inferior a 7/10. Haiku aplica la misma rúbrica del examen.">
      <div className="flex flex-col gap-4">{(samples ?? []).map((s) => { const a = byAgent.get(s.agent_id as string); return <article key={s.id as string} className="rounded-card border border-glass-border bg-black/20 p-4"><div className="flex flex-wrap justify-between gap-2"><p className="font-semibold">Muestra anonimizada #{String(s.id).slice(0, 8)}</p><Etiqueta tono="mal">{String(s.score)}/10</Etiqueta></div><p className="mt-2 text-small text-ink-2">{String((s.rubric as { motivo?: string })?.motivo ?? "Sin motivo")}</p><pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap rounded-card bg-black/30 p-3 text-tiny text-ink-2">{JSON.stringify(s.evidence_anonymized, null, 2)}</pre>{a && <div className="mt-3"><PanelSancionCalidad companyId={s.company_id as string} agentId={s.agent_id as string} /></div>}</article>; })}{!samples?.length && <p className="text-small text-ink-3">No hay muestras pendientes de revisión.</p>}</div>
    </Seccion>
    <Seccion id="alertas" titulo={`Alertas de calidad (${alerts?.length ?? 0})`} nota="Se consolidan por agente y día para no duplicar avisos.">
      <Tabla caption="Alertas recientes de calidad" vacio={!alerts?.length} textoVacio="No hay alertas de calidad." cols={[{ t: "Fecha" }, { t: "Alerta" }, { t: "Agente" }, { t: "Empresa" }, { t: "Detalle" }]}>{(alerts ?? []).map((x) => { const a = x.agent_id ? byAgent.get(x.agent_id as string) : null; return <tr key={x.id as string}><td>{new Date(x.creado_en as string).toLocaleString("es-ES")}</td><td><Etiqueta tono={x.tipo === "seguridad_grave" || x.tipo === "accion_fuera_permisos" ? "mal" : "aviso"}>{NOMBRES[x.tipo as string] ?? x.tipo as string}</Etiqueta></td><td>{a?.name ?? "—"}{a && <span className="block text-tiny text-ink-3">{a.estado as string}</span>}</td><td>{byCompany.get(x.company_id as string) ?? "—"}</td><td className="text-tiny text-ink-2">{JSON.stringify(x.detalle)}</td></tr>; })}</Tabla>
    </Seccion>
  </>;
}
