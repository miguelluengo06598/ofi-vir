/**
 * SOLO BASE LOCAL Y PRUEBAS. Certifica y activa un agente con una certificación de PRUEBA (`certifications.es_dato_de_prueba`), sin examen
 * ni revisión, para que los datos de la semilla y los agentes de las pruebas puedan ejecutar tareas reales en local: el motor exige
 * siempre un agente activo y certificado. Se niega a funcionar contra una base que no sea local.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export const esBaseLocal = (url: string | undefined) => /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])[:/]/.test(url ?? "");

export async function certificarAgenteDePrueba(db: SupabaseClient, companyId: string, agentId: string, env: Record<string, string | undefined> = process.env): Promise<void> {
  if (env.NODE_ENV === "production" || !esBaseLocal(env.NEXT_PUBLIC_SUPABASE_URL)) throw new Error("Las certificaciones de prueba solo se pueden crear contra la base local.");
  const { data: a, error } = await db.from("agents").select("estado, version_actual").eq("company_id", companyId).eq("id", agentId).maybeSingle();
  if (error || !a) throw new Error("Agente no encontrado.");
  if (a.estado === "activo") return;
  const caduca = new Date();
  caduca.setMonth(caduca.getMonth() + 6);
  const req = await db.from("certification_requests").insert({
    company_id: companyId, agent_id: agentId, agent_version: a.version_actual, tipo: "nueva", via: "completa", estado: "aprobada",
    resumen_cambios: "DATO DE PRUEBA (solo local): certificación sin examen ni revisión.", resuelto_en: new Date().toISOString(),
  }).select("id").single();
  if (req.error) throw new Error(`No se pudo crear la solicitud de prueba: ${req.error.message}`);
  // Directo y sin foto en `agent_versions` (que es de solo inserción): así las pruebas pueden borrar después sus agentes.
  const cert = await db.from("certifications").insert({ company_id: companyId, agent_id: agentId, agent_version: a.version_actual, request_id: req.data.id, caduca_en: caduca.toISOString(), es_dato_de_prueba: true });
  if (cert.error) throw new Error(`No se pudo certificar (prueba): ${cert.error.message}`);
  const act = await db.from("agents").update({ estado: "activo", version_certificada: a.version_actual, certificado_hasta: caduca.toISOString() }).eq("company_id", companyId).eq("id", agentId);
  if (act.error) throw new Error(`No se pudo activar (prueba): ${act.error.message}`);
  // El aviso «está certificado» de un dato de prueba solo haría ruido.
  await db.from("notifications").delete().eq("company_id", companyId).eq("tipo", "certificacion_estado").eq("metadatos->>request_id", req.data.id as string);
}
