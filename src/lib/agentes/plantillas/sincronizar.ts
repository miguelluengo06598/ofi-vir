import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { REGISTRO, obtenerHerramienta } from "../herramientas/registro.ts";
import { PERMISOS } from "../herramientas/tipos.ts";
import { LIMITES_PARTES } from "../instrucciones.ts";
import { certificarAgenteDePrueba } from "../../certificacion/datosDePrueba.ts";
import type { PlantillaAgente } from "./tipos.ts";

export const MIN_CASOS_DE_PRUEBA = 10;

/** Comprueba que una plantilla es coherente con el catálogo de herramientas. Devuelve la lista de problemas (vacía = bien). */
export function validarPlantilla(p: PlantillaAgente): string[] {
  const errores: string[] = [];
  const err = (m: string) => errores.push(`${p.id}: ${m}`);

  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(p.id)) err("el id debe ir en minúsculas y con guiones");
  for (const [campo, valor] of Object.entries({ nombrePorDefecto: p.nombrePorDefecto, rol: p.rol, descripcionPublica: p.descripcionPublica })) {
    if (!valor.trim()) err(`${campo} está vacío`);
  }
  if (!p.queHace.length) err("falta «qué hace»");
  if (!p.queNoHace.length) err("falta «qué no hace»");
  if (!p.instruccionesBase.trim()) err("faltan las instrucciones base");
  if (p.instruccionesBase.length > LIMITES_PARTES.plantilla) err(`las instrucciones base superan el límite de ${LIMITES_PARTES.plantilla} caracteres y se recortarían`);

  // Herramientas: existen, sin repetir, con permisos válidos y coherentes con su sensibilidad.
  const ids = p.herramientas.map((h) => h.id);
  if (new Set(ids).size !== ids.length) err("hay herramientas repetidas");
  for (const h of p.herramientas) {
    const def = obtenerHerramienta(h.id);
    if (!def) { err(`la herramienta «${h.id}» no existe en el registro`); continue; }
    if (!(PERMISOS as readonly string[]).includes(h.permisoDefecto)) err(`permiso inválido en «${h.id}»`);
    if (def.sensibilidad === "borrado" && (h.permisoDefecto === "sola" || h.editable)) {
      err(`«${h.id}» borra datos: siempre con aprobación y la empresa no puede relajarlo`);
    }
    if (def.sensibilidad === "envio_externo" && h.permisoDefecto === "sola" && !h.editable) {
      err(`«${h.id}» envía fuera de la empresa: si va sin aprobación, la empresa debe poder cambiarlo`);
    }
  }

  // Integraciones: exactamente las que necesitan sus herramientas.
  const necesarias = [...new Set(ids.map((i) => obtenerHerramienta(i)?.integracion).filter((x): x is string => !!x))].sort();
  const declaradas = [...p.integracionesRequeridas].sort();
  if (JSON.stringify(necesarias) !== JSON.stringify(declaradas)) {
    err(`integraciones declaradas (${declaradas.join(", ") || "ninguna"}) distintas de las que necesitan sus herramientas (${necesarias.join(", ") || "ninguna"})`);
  }

  // Las instrucciones no pueden citar herramientas que la plantilla no tiene.
  for (const h of REGISTRO) {
    if (p.instruccionesBase.includes(h.id) && !ids.includes(h.id)) err(`las instrucciones citan «${h.id}», que la plantilla no incluye`);
  }

  // Casos de prueba.
  if (p.casosDePrueba.length < MIN_CASOS_DE_PRUEBA) err(`hacen falta al menos ${MIN_CASOS_DE_PRUEBA} casos de prueba (hay ${p.casosDePrueba.length})`);
  const casos = p.casosDePrueba.map((c) => c.id);
  if (new Set(casos).size !== casos.length) err("hay casos de prueba con el mismo id");
  for (const c of p.casosDePrueba) {
    if (!c.entrada.trim() || !c.esperado.trim() || !c.titulo.trim()) err(`el caso «${c.id}» tiene campos vacíos`);
    for (const t of c.debeUsar ?? []) if (!ids.includes(t)) err(`el caso «${c.id}» exige «${t}», que la plantilla no incluye`);
    for (const t of c.noDebeUsar ?? []) if (!obtenerHerramienta(t)) err(`el caso «${c.id}» cita «${t}», que no existe`);
    for (const t of c.debeUsar ?? []) if (c.noDebeUsar?.includes(t)) err(`el caso «${c.id}» exige y prohíbe «${t}»`);
  }
  // Rutinas sugeridas: solo sugerencias (la empresa las activa). Ids únicos, con límite mensual y nunca «cada hora».
  const rutinas = p.rutinasSugeridas ?? [];
  if (new Set(rutinas.map((r) => r.id)).size !== rutinas.length) err("hay rutinas sugeridas con el mismo id");
  for (const r of rutinas) {
    if (!r.instruccion.trim() || !r.nombre.trim()) err(`la rutina sugerida «${r.id}» necesita nombre e instrucción`);
    if (!Number.isInteger(r.maxEjecucionesMes) || r.maxEjecucionesMes < 1 || r.maxEjecucionesMes > 31) err(`la rutina sugerida «${r.id}» necesita un límite mensual entre 1 y 31`);
    if (r.frecuencia === "cada_hora") err(`la rutina sugerida «${r.id}» no puede ser cada hora`);
  }
  return errores;
}

/** Lo que se copia a `agent_templates` (sin versión, fechas ni huella). Las claves van siempre en el mismo orden. */
export function contenidoParaBase(p: PlantillaAgente) {
  return {
    nombre_por_defecto: p.nombrePorDefecto,
    rol: p.rol,
    departamento_tipo: p.departamentoTipo,
    descripcion_publica: p.descripcionPublica,
    que_hace: p.queHace.map((l) => `- ${l}`).join("\n"),
    que_no_hace: p.queNoHace.map((l) => `- ${l}`).join("\n"),
    instrucciones_base: p.instruccionesBase.trim(),
    herramientas_disponibles: [...p.herramientas]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((h) => ({ id: h.id, permiso_defecto: h.permisoDefecto, editable: h.editable })),
    integraciones_requeridas: [...p.integracionesRequeridas].sort(),
    tipo_tarea_por_defecto: p.tipoTareaPorDefecto,
  };
}
/** Resumen de cambios de la versión actual (lo ve la empresa en «Hay una versión nueva de la plantilla»). No cuenta para la huella. */
const novedadesDe = (p: PlantillaAgente): string | null => p.novedades?.trim() || null;

/** Huella del contenido: cambia si y solo si cambia algo que la plantilla copia a la base. Los casos de prueba no cuentan. */
export const huellaDe = (p: PlantillaAgente): string => createHash("sha256").update(JSON.stringify(contenidoParaBase(p))).digest("hex");

export type ResultadoSync = { id: string; accion: "creada" | "actualizada" | "sin_cambios"; version: number };

/**
 * Copia las plantillas a la base (clave de servicio). Crea las nuevas (versión 1), actualiza las que cambiaron subiendo la
 * versión y no toca las iguales. La versión nueva queda pendiente de certificar (la base lo calcula).
 */
export async function sincronizarPlantillas(db: SupabaseClient, plantillas: readonly PlantillaAgente[], opciones: { simular?: boolean } = {}): Promise<ResultadoSync[]> {
  const errores = plantillas.flatMap(validarPlantilla);
  if (errores.length) throw new Error(`Plantillas inválidas:\n- ${errores.join("\n- ")}`);

  const { data: existentes, error } = await db.from("agent_templates").select("id, version, contenido_hash").in("id", plantillas.map((p) => p.id));
  if (error) throw new Error(`No se pudo leer agent_templates: ${error.message}`);
  const porId = new Map((existentes ?? []).map((e) => [e.id as string, e as { id: string; version: number; contenido_hash: string | null }]));

  const resultados: ResultadoSync[] = [];
  for (const p of plantillas) {
    const huella = huellaDe(p);
    const actual = porId.get(p.id);
    if (!actual) {
      if (!opciones.simular) {
        const { error: e } = await db.from("agent_templates").insert({ id: p.id, ...contenidoParaBase(p), version: 1, contenido_hash: huella, novedades: novedadesDe(p) });
        if (e) throw new Error(`No se pudo crear ${p.id}: ${e.message}`);
      }
      resultados.push({ id: p.id, accion: "creada", version: 1 });
    } else if (actual.contenido_hash !== huella) {
      const version = actual.version + 1;
      if (!opciones.simular) {
        const { error: e } = await db.from("agent_templates").update({ ...contenidoParaBase(p), version, contenido_hash: huella, novedades: novedadesDe(p) }).eq("id", p.id).eq("version", actual.version);
        if (e) throw new Error(`No se pudo actualizar ${p.id}: ${e.message}`);
      }
      resultados.push({ id: p.id, accion: "actualizada", version });
    } else {
      resultados.push({ id: p.id, accion: "sin_cambios", version: actual.version });
    }
  }
  return resultados;
}

/** Agentes del seed y la plantilla con la que se enlazan (solo para la base local). */
export const AGENTES_DEL_SEED_CON_PLANTILLA: readonly { companyId: string; agentId: string; nombre: string; plantilla: string }[] = [
  { companyId: "a64499d1-7f43-4a43-abc8-41a313dc4018", agentId: "0e9902f1-d636-4806-a597-7d1d4bf9e7b4", nombre: "Lucía Ramos", plantilla: "lucia-sdr" },
  { companyId: "a64499d1-7f43-4a43-abc8-41a313dc4018", agentId: "426ade0b-f542-472b-aa70-3b385993a459", nombre: "Sofía Navarro", plantilla: "sara-whatsapp" },
  { companyId: "a64499d1-7f43-4a43-abc8-41a313dc4018", agentId: "ff8c5e5f-b60a-4fdf-ab7b-f7e7fed013a0", nombre: "Nuria Campos", plantilla: "ivan-crm" },
];

/**
 * SOLO BASE LOCAL. Certifica la versión actual de cada plantilla con una certificación de PRUEBA (`es_dato_de_prueba`, sin
 * revisor) y enlaza a las plantillas los agentes del seed que aún no tienen. La certificación real la hará IDESIE.
 */
export async function aplicarDatosDePrueba(db: SupabaseClient, plantillas: readonly PlantillaAgente[]): Promise<{ certificadas: string[]; enlazados: string[]; agentesActivados: string[] }> {
  const certificadas: string[] = [];
  for (const p of plantillas) {
    const { data: t, error } = await db.from("agent_templates").select("version").eq("id", p.id).single();
    if (error || !t) throw new Error(`La plantilla ${p.id} no está en la base: ejecuta antes la sincronización.`);
    const { data: ya } = await db.from("template_certifications").select("id").eq("template_id", p.id).eq("template_version", t.version).eq("estado", "vigente").maybeSingle();
    if (ya) continue;
    const caduca = new Date();
    caduca.setMonth(caduca.getMonth() + 6);
    const { error: e } = await db.from("template_certifications").insert({ template_id: p.id, template_version: t.version, caduca_en: caduca.toISOString(), es_dato_de_prueba: true });
    if (e) throw new Error(`No se pudo certificar ${p.id} (prueba): ${e.message}`);
    certificadas.push(`${p.id} v${t.version}`);
  }

  const enlazados: string[] = [];
  for (const a of AGENTES_DEL_SEED_CON_PLANTILLA) {
    if (!plantillas.some((p) => p.id === a.plantilla)) continue;
    const { data, error } = await db.from("agents").update({ template_id: a.plantilla }).eq("company_id", a.companyId).eq("id", a.agentId).is("template_id", null).select("id");
    if (error) throw new Error(`No se pudo enlazar a ${a.nombre}: ${error.message}`);
    if (data?.length) enlazados.push(`${a.nombre} → ${a.plantilla}`);
  }
  // El motor solo ejecuta agentes activos y certificados: los de la empresa del seed reciben una certificación de PRUEBA.
  const agentesActivados: string[] = [];
  for (const companyId of new Set(AGENTES_DEL_SEED_CON_PLANTILLA.map((a) => a.companyId))) {
    const { data, error } = await db.from("agents").select("id, name").eq("company_id", companyId).in("estado", ["borrador", "en_pruebas"]).order("name");
    if (error) throw new Error(`No se pudieron leer los agentes del seed: ${error.message}`);
    for (const a of data ?? []) {
      await certificarAgenteDePrueba(db, companyId, a.id as string);
      agentesActivados.push(a.name as string);
    }
  }
  return { certificadas, enlazados, agentesActivados };
}
