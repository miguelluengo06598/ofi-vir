/**
 * Exportación de los datos de una empresa (derecho de portabilidad). SAMGPLE la lanza a petición del cliente; se genera en
 * segundo plano y el archivo (JSON) queda en el bucket privado `exportaciones`. SOLO lo descarga un propietario o administrador
 * de la empresa (GET /api/empresas/exportaciones/[id]): SAMGPLE ve el estado y el tamaño, nunca el contenido.
 * Columnas elegidas a mano: lo que la empresa y sus agentes generaron con ella. Fuera quedan los costes internos de la
 * plataforma, los vectores, las instrucciones base protegidas de IDESIE y los secretos de conexión. Solo servidor.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { DIAS_EXPORTACION } from "./config.ts";

export const BUCKET_EXPORTACIONES = "exportaciones";

/** Qué se exporta de cada tabla (todas filtradas por company_id). */
export const TABLAS_EXPORTACION: Record<string, string> = {
  departments: "id, slug, name, tipo, activo, orden, created_at",
  agents: "id, department_id, slug, name, role, model, estado, template_id, template_version, tono, objetivo, nunca_hace, instrucciones_empresa, negocio_resumen, version_actual, version_certificada, certificado_hasta, created_at",
  agent_rules: "agent_id, zona_horaria, horario, fuera_de_horario, mensaje_fuera_horario, max_mensajes_dia, tope_creditos_mes, aviso_ia_texto, idioma",
  agent_tools: "agent_id, tool_id, permiso, limite_diario",
  agent_handoffs: "id, agent_id_origen, agent_id_destino, condicion, tipo_traspaso, activo",
  agent_knowledge: "id, agent_id, tipo, titulo, origen, estado, contenido, bytes, fragmentos, paginas, creado_en, procesado_en",
  agent_corrections: "id, agent_id, contexto, respuesta_original, respuesta_corregida, regla_aprendida, estado, creado_en",
  agent_test_cases: "id, agent_id, titulo, entrada, esperado, debe_usar, no_debe_usar, creado_en",
  agent_routines: "id, agent_id, nombre, descripcion, instruccion, tipo_tarea, frecuencia, activa, max_ejecuciones_mes, proxima_ejecucion_en, ultima_ejecucion_en, creado_en",
  agent_followups: "id, agent_id, contact_id, fecha_prevista, motivo, mensaje_previsto, estado, decidido_en, creado_en",
  agent_feedback: "id, agent_id, task_id, approval_id, value, reason, created_at",
  contacts: "id, name, email, organization, job_title, created_at",
  email_threads: "id, contact_id, agent_id, subject, status, last_message_at, created_at",
  emails: "id, thread_id, direction, from_address, to_address, subject, body, attachments, delivery_status, occurred_at, created_at",
  memory_nodes: "id, contact_id, node_type, title, content, confidence, external, source_task_id, knowledge_id, ambito_agent_id, created_at, updated_at",
  memory_edges: "id, from_node_id, to_node_id, kind, created_at",
  tasks: "id, agent_id, title, status, origen, contact_id, chain_id, steps, started_at, finished_at, review_reason, es_simulacion",
  handoff_chains: "id, title, goal, estado, created_at",
  handoffs: "id, chain_id, position, from_agent_id, to_agent_id, kind, tipo_traspaso, summary, ficha, status, occurred_at",
  approvals: "id, agent_id, kind, title, detail, payload, status, requested_at, decided_at",
  human_tasks: "id, agent_id, task_id, contact_id, titulo, contexto, urgencia, estado, creado_en, resuelta_en",
  notifications: "id, tipo, titulo, cuerpo, creado_en, leida_en",
  company_connections: "id, proveedor, estado, cuenta_externa, scopes, conectado_en",
  credit_lots: "id, origen, pack_id, creditos_iniciales, creditos_restantes, caduca_en, creado_en",
  credit_ledger: "id, tipo, creditos, concepto, agent_id, department_id, task_id, creado_en, saldo_resultante",
  purchases: "id, pack_id, modalidad, importe_centimos, iva_centimos, total_centimos, estado, creado_en",
  company_credit_settings: "tope_mensual_creditos, recarga_auto_activa, recarga_auto_umbral, recarga_auto_pack_id, bono_mensual_pack_id, estado_oficina",
};

const POR_PAGINA = 1000;

async function todasLasFilas(db: SupabaseClient, tabla: string, columnas: string, companyId: string): Promise<unknown[]> {
  const filas: unknown[] = [];
  for (let desde = 0; ; desde += POR_PAGINA) {
    const { data, error } = await db.from(tabla).select(columnas).eq("company_id", companyId).range(desde, desde + POR_PAGINA - 1);
    if (error) throw new Error(`exportar:${tabla}:${error.code ?? "error"}`);
    filas.push(...(data ?? []));
    if (!data || data.length < POR_PAGINA) return filas;
  }
}

/** Construye el documento de la exportación (separado para poder probarlo). */
export async function construirExportacion(db: SupabaseClient, companyId: string, ahora = new Date()) {
  const [{ data: empresa, error: e1 }, { data: miembros, error: e2 }, { data: fiscales }] = await Promise.all([
    db.from("companies").select("id, name, sector, created_at").eq("id", companyId).single(),
    db.from("company_members").select("user_id, rol, estado, puede_aprobar, creado_en").eq("company_id", companyId),
    db.from("empresa_datos_fiscales").select("razon_social, nif, direccion, codigo_postal, ciudad, provincia, pais, email_facturacion").eq("company_id", companyId).maybeSingle(),
  ]);
  if (e1 || e2 || !empresa) throw new Error("exportar:empresa");
  const ids = (miembros ?? []).map((m) => m.user_id as string);
  const { data: perfiles } = ids.length ? await db.from("users").select("id, full_name, email").in("id", ids) : { data: [] };
  const perfil = new Map((perfiles ?? []).map((p) => [p.id as string, p]));
  const datos: Record<string, unknown[]> = {};
  for (const [tabla, columnas] of Object.entries(TABLAS_EXPORTACION)) datos[tabla] = await todasLasFilas(db, tabla, columnas, companyId);
  return {
    formato: "oficina-virtual-exportacion", version: 1, generada_en: ahora.toISOString(),
    nota: "Datos de tu empresa en la Oficina Virtual IA. Fechas en UTC (ISO 8601). Los créditos son enteros (1 crédito = 1 céntimo); el dinero va en céntimos.",
    empresa, datos_fiscales: fiscales ?? null,
    miembros: (miembros ?? []).map((m) => ({ ...m, nombre: perfil.get(m.user_id)?.full_name ?? null, email: perfil.get(m.user_id)?.email ?? null })),
    datos,
  };
}

/** Genera el archivo y deja la exportación «lista» (o «error» con un código, nunca con contenido). Pensada para `after()`. */
export async function generarExportacion(db: SupabaseClient, exportacionId: string, ahora = () => new Date()): Promise<void> {
  const { data: exp } = await db.from("empresa_exportaciones").select("id, company_id, estado").eq("id", exportacionId).single();
  if (!exp || exp.estado !== "procesando") return;
  try {
    const doc = await construirExportacion(db, exp.company_id, ahora());
    const cuerpo = new TextEncoder().encode(JSON.stringify(doc, null, 2));
    const ruta = `${exp.company_id}/${exp.id}.json`;
    const subida = await db.storage.from(BUCKET_EXPORTACIONES).upload(ruta, cuerpo, { contentType: "application/json", upsert: true });
    if (subida.error) throw new Error("exportar:subida");
    const fin = ahora();
    const caduca = new Date(fin.getTime() + DIAS_EXPORTACION * 86_400_000);
    const { error } = await db.from("empresa_exportaciones").update({ estado: "lista", ruta_archivo: ruta, tamano_bytes: cuerpo.byteLength, terminada_en: fin.toISOString(), caduca_en: caduca.toISOString() }).eq("id", exp.id).eq("estado", "procesando");
    if (error) throw new Error("exportar:estado");
    await db.from("notifications").insert({
      company_id: exp.company_id, tipo: "exportacion_lista", titulo: "Tu exportación de datos está lista",
      cuerpo: `Descárgala desde Cuenta antes del ${caduca.toLocaleDateString("es-ES", { day: "numeric", month: "long" })}. Solo propietarios y administradores pueden descargarla.`,
      metadatos: { exportacion_id: exp.id, enlace: `/api/empresas/exportaciones/${exp.id}` },
    });
  } catch (e) {
    const codigo = e instanceof Error && /^exportar:/.test(e.message) ? e.message : "exportar:desconocido";
    console.error(`[admin/clientes] exportación ${exp.id} falló: ${codigo}`);
    await db.from("empresa_exportaciones").update({ estado: "error", error: codigo, terminada_en: ahora().toISOString() }).eq("id", exp.id);
  }
}

/** Descarga para la empresa: enlace firmado de 5 min. Caducada → borra el archivo y responde null. */
export async function enlaceDeDescarga(db: SupabaseClient, companyId: string, exportacionId: string, ahora = new Date()): Promise<{ url: string } | { error: "no_encontrada" | "no_lista" | "caducada" }> {
  const { data: exp } = await db.from("empresa_exportaciones").select("id, estado, ruta_archivo, caduca_en").eq("id", exportacionId).eq("company_id", companyId).maybeSingle();
  if (!exp) return { error: "no_encontrada" };
  if (exp.estado === "caducada") return { error: "caducada" };
  if (exp.estado !== "lista" || !exp.ruta_archivo) return { error: "no_lista" };
  if (exp.caduca_en && new Date(exp.caduca_en) < ahora) {
    await db.storage.from(BUCKET_EXPORTACIONES).remove([exp.ruta_archivo]);
    await db.from("empresa_exportaciones").update({ estado: "caducada", ruta_archivo: null }).eq("id", exp.id);
    return { error: "caducada" };
  }
  const { data, error } = await db.storage.from(BUCKET_EXPORTACIONES).createSignedUrl(exp.ruta_archivo, 300, { download: `exportacion-${exp.id}.json` });
  if (error || !data) throw new Error("exportar:firma");
  await db.from("empresa_exportaciones").update({ descargada_en: ahora.toISOString() }).eq("id", exp.id);
  return { url: data.signedUrl };
}
