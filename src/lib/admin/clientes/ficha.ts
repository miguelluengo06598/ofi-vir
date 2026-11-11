/**
 * Lectores de la ficha de un cliente (/admin/clientes/[id]), uno por pestaña. Solo servidor y con la clave de servicio, así que
 * cada consulta elige columnas a mano: metadatos, estados y agregados. NUNCA contactos, correos, memoria, tareas ni conversaciones.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { obtenerClientes, type Cliente } from "./listado.ts";

const err = (que: string) => new Error(`No se pudo leer ${que}.`);

export type Cabecera = Cliente & { borradaEn: string | null; suspendidaEn: string | null };

export async function cabeceraCliente(db: SupabaseClient, companyId: string, ahora = new Date()): Promise<Cabecera | null> {
  const [lista, extra] = await Promise.all([
    obtenerClientes(db, ahora, companyId),
    db.from("companies").select("borrada_en, suspendida_en").eq("id", companyId).eq("es_examen", false).maybeSingle(),
  ]);
  const c = lista.find((x) => x.id === companyId);
  if (!c || !extra.data) return null;
  return { ...c, borradaEn: (extra.data.borrada_en as string | null) ?? null, suspendidaEn: (extra.data.suspendida_en as string | null) ?? null };
}

// ── Resumen ─────────────────────────────────────────────────────────────────────────────────────
export type Resumen = { servicios: string[]; fichaActualizadaEn: string | null; notas: { id: string; autor: string; texto: string; creadoEn: string }[] };
export async function resumenCliente(db: SupabaseClient, companyId: string): Promise<Resumen> {
  const [f, n] = await Promise.all([
    db.from("cliente_ficha").select("servicios, actualizado_en").eq("company_id", companyId).maybeSingle(),
    db.from("cliente_notas").select("id, autor_id, texto, creado_en").eq("company_id", companyId).order("creado_en", { ascending: false }).limit(100),
  ]);
  if (f.error || n.error) throw err("la ficha interna");
  const nombres = await nombresSamgple(db, (n.data ?? []).map((x) => x.autor_id as string));
  return {
    servicios: (f.data?.servicios as string[] | undefined) ?? [], fichaActualizadaEn: (f.data?.actualizado_en as string | null) ?? null,
    notas: (n.data ?? []).map((x) => ({ id: x.id as string, autor: nombres.get(x.autor_id as string) ?? "Equipo MyOfia", texto: x.texto as string, creadoEn: x.creado_en as string })),
  };
}

async function nombresSamgple(db: SupabaseClient, ids: string[]): Promise<Map<string, string>> {
  const unicos = [...new Set(ids.filter(Boolean))];
  if (unicos.length === 0) return new Map();
  const { data } = await db.from("platform_roles").select("user_id, nombre").in("user_id", unicos);
  return new Map((data ?? []).map((p) => [p.user_id as string, (p.nombre as string | null) ?? "Equipo MyOfia"]));
}

// ── Datos fiscales ──────────────────────────────────────────────────────────────────────────────
export type DatosFiscales = { razonSocial: string; nif: string; direccion: string; codigoPostal: string; ciudad: string; provincia: string | null; pais: string; emailFacturacion: string; actualizadoEn: string };
export async function datosFiscales(db: SupabaseClient, companyId: string): Promise<DatosFiscales | null> {
  const { data, error } = await db.from("empresa_datos_fiscales").select("razon_social, nif, direccion, codigo_postal, ciudad, provincia, pais, email_facturacion, actualizado_en").eq("company_id", companyId).maybeSingle();
  if (error) throw err("los datos fiscales");
  return data ? { razonSocial: data.razon_social, nif: data.nif, direccion: data.direccion, codigoPostal: data.codigo_postal, ciudad: data.ciudad, provincia: data.provincia, pais: data.pais, emailFacturacion: data.email_facturacion, actualizadoEn: data.actualizado_en } : null;
}

// ── Miembros ────────────────────────────────────────────────────────────────────────────────────
export type Miembro = { userId: string; nombre: string; email: string; rol: string; estado: string; puedeAprobar: boolean; desde: string };
export type Invitacion = { id: string; email: string; rol: string; creadaEn: string; caducaEn: string; estado: "pendiente" | "caducada" | "aceptada" | "revocada" };
export type CambioPropietario = { id: string; actual: string; nuevo: string; motivo: string; estado: string; solicitadoPor: string; creadoEn: string; caducaEn: string; resueltoVia: string | null };
export async function miembrosCliente(db: SupabaseClient, companyId: string, ahora = new Date()): Promise<{ miembros: Miembro[]; invitaciones: Invitacion[]; cambios: CambioPropietario[] }> {
  const [m, i, c] = await Promise.all([
    db.from("company_members").select("user_id, rol, estado, puede_aprobar, creado_en").eq("company_id", companyId).order("creado_en"),
    db.from("company_invitations").select("id, email, rol, propietario, creado_en, caduca_en, aceptada_en, revocada_en").eq("company_id", companyId).order("creado_en", { ascending: false }).limit(50),
    db.from("cambios_propietario").select("id, propietario_actual, nuevo_propietario, motivo, estado, solicitado_por, creado_en, caduca_en, resuelto_via").eq("company_id", companyId).order("creado_en", { ascending: false }).limit(20),
  ]);
  if (m.error || i.error || c.error) throw err("los miembros");
  const ids = [...(m.data ?? []).map((x) => x.user_id as string), ...(c.data ?? []).flatMap((x) => [x.propietario_actual as string, x.nuevo_propietario as string])];
  const { data: perfiles } = ids.length ? await db.from("users").select("id, full_name, email").in("id", [...new Set(ids)]) : { data: [] };
  const perfil = new Map((perfiles ?? []).map((p) => [p.id as string, { nombre: p.full_name as string, email: p.email as string }]));
  const samgple = await nombresSamgple(db, (c.data ?? []).map((x) => x.solicitado_por as string));
  return {
    miembros: (m.data ?? []).map((x) => ({ userId: x.user_id, nombre: perfil.get(x.user_id)?.nombre ?? "—", email: perfil.get(x.user_id)?.email ?? "", rol: x.rol, estado: x.estado, puedeAprobar: x.puede_aprobar, desde: x.creado_en })),
    invitaciones: (i.data ?? []).map((x) => ({
      id: x.id, email: x.email, rol: x.propietario ? "propietario_invitado" : x.rol, creadaEn: x.creado_en, caducaEn: x.caduca_en,
      estado: x.aceptada_en ? "aceptada" : x.revocada_en ? "revocada" : new Date(x.caduca_en) < ahora ? "caducada" : "pendiente",
    })),
    cambios: (c.data ?? []).map((x) => ({
      id: x.id, actual: perfil.get(x.propietario_actual)?.nombre ?? "—", nuevo: perfil.get(x.nuevo_propietario)?.nombre ?? "—", motivo: x.motivo,
      estado: x.estado === "pendiente" && new Date(x.caduca_en) < ahora ? "caducado" : x.estado, solicitadoPor: samgple.get(x.solicitado_por) ?? "Equipo MyOfia",
      creadoEn: x.creado_en, caducaEn: x.caduca_en, resueltoVia: x.resuelto_via,
    })),
  };
}

// ── Oficina: departamentos y agentes (estado y certificación; nada de conversaciones) ─────────────
export type AgenteFicha = { id: string; nombre: string; puesto: string; estado: string; plantilla: string | null; modelo: string; versionActual: number | null; versionCertificada: number | null; certificadoHasta: string | null; solicitud: string | null; pausadoMotivo: string | null };
export type DepartamentoFicha = { id: string; nombre: string; agentes: AgenteFicha[] };
export async function oficinaCliente(db: SupabaseClient, companyId: string): Promise<DepartamentoFicha[]> {
  const [d, a, s] = await Promise.all([
    db.from("departments").select("id, name").eq("company_id", companyId).order("name"),
    db.from("agents").select("id, department_id, name, role, estado, template_id, model, version_actual, version_certificada, certificado_hasta, pausado_motivo").eq("company_id", companyId).order("name"),
    db.from("certification_requests").select("agent_id, estado, enviado_en").eq("company_id", companyId).order("enviado_en", { ascending: false }).limit(200),
  ]);
  if (d.error || a.error || s.error) throw err("la oficina");
  const ultima = new Map<string, string>();
  for (const r of s.data ?? []) if (!ultima.has(r.agent_id as string)) ultima.set(r.agent_id as string, r.estado as string);
  const agentes = (a.data ?? []).map((x) => ({
    dep: x.department_id as string,
    ag: { id: x.id, nombre: x.name, puesto: x.role, estado: x.estado, plantilla: x.template_id, modelo: x.model, versionActual: x.version_actual, versionCertificada: x.version_certificada, certificadoHasta: x.certificado_hasta, solicitud: ultima.get(x.id) ?? null, pausadoMotivo: x.pausado_motivo } as AgenteFicha,
  }));
  return (d.data ?? []).map((dep) => ({ id: dep.id, nombre: dep.name, agentes: agentes.filter((x) => x.dep === dep.id).map((x) => x.ag) }));
}

// ── Créditos ────────────────────────────────────────────────────────────────────────────────────
export type CreditosFicha = {
  lotes: { id: string; origen: string; pack: string | null; iniciales: number; restantes: number; caducaEn: string; creadoEn: string }[];
  compras: { id: string; pack: string; modalidad: string; importe: number; iva: number; total: number; estado: string; creadoEn: string }[];
  consumo: { total: number; porAgente: { nombre: string; creditos: number }[]; porDepartamento: { nombre: string; creditos: number }[] };
  ajustes: { tope: number | null; recargaActiva: boolean; recargaUmbral: number | null; recargaPack: string | null; bonoPack: string | null; estadoOficina: string; pausadaPorSamgple: boolean; motivoPausa: string | null };
  movimientosAdmin: { creditos: number; concepto: string; creadoEn: string }[];
};
export async function creditosCliente(db: SupabaseClient, companyId: string, ahora = new Date()): Promise<CreditosFicha> {
  const [l, p, r, s, m] = await Promise.all([
    db.from("credit_lots").select("id, origen, pack_id, creditos_iniciales, creditos_restantes, caduca_en, creado_en").eq("company_id", companyId).order("creado_en", { ascending: false }).limit(100),
    db.from("purchases").select("id, pack_id, modalidad, importe_centimos, iva_centimos, total_centimos, estado, creado_en").eq("company_id", companyId).order("creado_en", { ascending: false }).limit(100),
    db.rpc("resumen_consumo_mes", { p_company_id: companyId, p_ahora: ahora.toISOString() }),
    db.from("company_credit_settings").select("tope_mensual_creditos, recarga_auto_activa, recarga_auto_umbral, recarga_auto_pack_id, bono_mensual_pack_id, estado_oficina, pausada_por_samgple, pausada_samgple_motivo").eq("company_id", companyId).maybeSingle(),
    db.from("credit_ledger").select("creditos, concepto, creado_en").eq("company_id", companyId).eq("tipo", "ajuste").order("creado_en", { ascending: false }).limit(50),
  ]);
  if (l.error || p.error || r.error || s.error || m.error) throw err("los créditos");
  const res = (r.data ?? {}) as { total?: number; por_agente?: { nombre: string; creditos: number }[]; por_departamento?: { nombre: string; creditos: number }[] };
  return {
    lotes: (l.data ?? []).map((x) => ({ id: x.id, origen: x.origen, pack: x.pack_id, iniciales: x.creditos_iniciales, restantes: x.creditos_restantes, caducaEn: x.caduca_en, creadoEn: x.creado_en })),
    compras: (p.data ?? []).map((x) => ({ id: x.id, pack: x.pack_id, modalidad: x.modalidad, importe: x.importe_centimos, iva: x.iva_centimos, total: x.total_centimos, estado: x.estado, creadoEn: x.creado_en })),
    consumo: { total: res.total ?? 0, porAgente: res.por_agente ?? [], porDepartamento: res.por_departamento ?? [] },
    ajustes: {
      tope: s.data?.tope_mensual_creditos ?? null, recargaActiva: s.data?.recarga_auto_activa ?? false, recargaUmbral: s.data?.recarga_auto_umbral ?? null,
      recargaPack: s.data?.recarga_auto_pack_id ?? null, bonoPack: s.data?.bono_mensual_pack_id ?? null, estadoOficina: s.data?.estado_oficina ?? "—",
      pausadaPorSamgple: Boolean(s.data?.pausada_por_samgple), motivoPausa: s.data?.pausada_samgple_motivo ?? null,
    },
    movimientosAdmin: (m.data ?? []).map((x) => ({ creditos: x.creditos, concepto: x.concepto, creadoEn: x.creado_en })),
  };
}

// ── Implantación y soporte (tablas de la oficina de MyOfia: implantaciones y soporte_consultas) ─────
export type ImplantacionFicha = { estado: string; responsable: string | null; inicio: string; objetivoFin: string | null; tareas: { id: string; titulo: string; venceEn: string | null; hechaEn: string | null }[] } | null;
export async function implantacionCliente(db: SupabaseClient, companyId: string): Promise<ImplantacionFicha> {
  const { data, error } = await db.from("implantaciones").select("id, estado, responsable, inicio, objetivo_fin, implantacion_tareas(id, titulo, orden, vence_en, hecha_en)").eq("company_id", companyId).maybeSingle();
  if (error) throw err("la implantación");
  if (!data) return null;
  const nombres = await nombresSamgple(db, [data.responsable as string]);
  const tareas = ((data.implantacion_tareas ?? []) as { id: string; titulo: string; orden: number; vence_en: string | null; hecha_en: string | null }[]).sort((a, b) => a.orden - b.orden);
  return { estado: data.estado, responsable: data.responsable ? nombres.get(data.responsable) ?? "Equipo MyOfia" : null, inicio: data.inicio, objetivoFin: data.objetivo_fin, tareas: tareas.map((t) => ({ id: t.id, titulo: t.titulo, venceEn: t.vence_en, hechaEn: t.hecha_en })) };
}

export type ConsultaSoporte = { id: string; asunto: string; estado: string; prioridad: string; asignadaA: string | null; creadoEn: string; resueltaEn: string | null };
export async function soporteCliente(db: SupabaseClient, companyId: string): Promise<{ consultas: ConsultaSoporte[]; exportaciones: { id: string; estado: string; tamano: number | null; creadoEn: string; caducaEn: string | null; descargadaEn: string | null; solicitadaPor: string; motivo: string }[] }> {
  const [c, e] = await Promise.all([
    db.from("soporte_consultas").select("id, asunto, estado, prioridad, asignada_a, creado_en, resuelta_en").eq("company_id", companyId).order("creado_en", { ascending: false }).limit(100),
    db.from("empresa_exportaciones").select("id, estado, tamano_bytes, creado_en, caduca_en, descargada_en, solicitada_por, motivo").eq("company_id", companyId).order("creado_en", { ascending: false }).limit(20),
  ]);
  if (c.error || e.error) throw err("el soporte");
  const nombres = await nombresSamgple(db, [...(c.data ?? []).map((x) => x.asignada_a as string), ...(e.data ?? []).map((x) => x.solicitada_por as string)]);
  return {
    consultas: (c.data ?? []).map((x) => ({ id: x.id, asunto: x.asunto, estado: x.estado, prioridad: x.prioridad, asignadaA: x.asignada_a ? nombres.get(x.asignada_a) ?? "Equipo MyOfia" : null, creadoEn: x.creado_en, resueltaEn: x.resuelta_en })),
    exportaciones: (e.data ?? []).map((x) => ({ id: x.id, estado: x.estado, tamano: x.tamano_bytes, creadoEn: x.creado_en, caducaEn: x.caduca_en, descargadaEn: x.descargada_en, solicitadaPor: nombres.get(x.solicitada_por) ?? "Equipo MyOfia", motivo: x.motivo })),
  };
}

// ── Actividad: registro de auditoría de MyOfia sobre esta empresa ───────────────────────────────
export type EventoAuditoria = { id: string; actor: string; creadoEn: string; accion: string; motivo: string | null; ip: string | null; antes: unknown; despues: unknown };
export async function actividadCliente(db: SupabaseClient, companyId: string): Promise<EventoAuditoria[]> {
  const { data, error } = await db.from("admin_audit_log").select("id, actor_id, creado_en, accion, motivo, ip, antes, despues").eq("company_id", companyId).order("creado_en", { ascending: false }).limit(200);
  if (error) throw err("la actividad");
  const nombres = await nombresSamgple(db, (data ?? []).map((x) => x.actor_id as string));
  return (data ?? []).map((x) => ({ id: x.id, actor: nombres.get(x.actor_id) ?? "Persona (sin rol de plataforma)", creadoEn: x.creado_en, accion: x.accion, motivo: x.motivo, ip: x.ip, antes: x.antes, despues: x.despues }));
}
