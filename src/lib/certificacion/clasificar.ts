/**
 * ¿Cambio menor o importante? (reglas de CLAUDE.md, «Recertificación»). Lo decide el código comparando las fotos de dos versiones.
 *  - Menor (solo examen técnico): tono, textos del negocio, nombre, horario y mensajes, idioma, endurecer permisos o límites,
 *    quitar herramientas o traspasos, ampliar «lo que nunca hace», añadir correcciones aprendidas.
 *  - Importante (certificación completa): instrucciones, objetivo o rol; añadir herramientas (y, con ellas, integraciones nuevas);
 *    ampliar permisos o límites; traspasos nuevos o con otra condición; cambio de modelo de IA; otra versión de la plantilla;
 *    quitar límites de «lo que nunca hace», el aviso de IA, las reglas o una corrección.
 *  - Ante la duda, importante: cualquier diferencia que estas reglas no reconozcan cuenta como importante.
 */
import { obtenerHerramienta } from "../agentes/herramientas/registro.ts";
import type { ConfigVersion } from "./clonar.ts";

const RANGO = { sola: 0, aprobacion: 1, humano: 2, prohibida: 3 } as const;
const norm = (s: string | null | undefined) => (s ?? "").normalize("NFD").replace(/\p{M}/gu, "").replace(/\s+/g, " ").trim().toLowerCase();
const igual = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

export type TipoDeCambio = "menor" | "importante";
export type CambioClasificado = { tipo: TipoDeCambio; motivos: string[] };

const FICHA_CONOCIDA = new Set(["nombre", "rol", "template_id", "modelo", "negocio_resumen", "tono", "objetivo", "nunca_hace", "instrucciones_empresa"]);
const REGLAS_MENORES: Record<string, string> = { zona_horaria: "la zona horaria", horario: "el horario", mensaje_fuera_horario: "el mensaje de fuera de horario", idioma: "el idioma" };
const REGLAS_CONOCIDAS = new Set([...Object.keys(REGLAS_MENORES), "fuera_de_horario", "max_mensajes_dia", "tope_creditos_mes", "aviso_ia_texto"]);
const RAIZ_CONOCIDA = new Set(["ficha", "herramientas", "reglas", "traspasos", "correcciones", "plantilla_version"]);

/** Compara la foto de dos versiones y dice si el cambio es menor o importante, con sus motivos. */
export function clasificarCambio(versionAnterior: ConfigVersion, versionNueva: ConfigVersion): CambioClasificado {
  const importantes: string[] = [];
  const menores: string[] = [];
  const a = versionAnterior.ficha, b = versionNueva.ficha;

  // — Ficha
  if (a.modelo !== b.modelo) importantes.push(`Cambia el modelo de IA (${a.modelo} → ${b.modelo}).`);
  if (a.template_id !== b.template_id) importantes.push("Cambia la plantilla de origen.");
  if (norm(a.instrucciones_empresa) !== norm(b.instrucciones_empresa)) importantes.push("Cambian las instrucciones de la empresa.");
  if (norm(a.objetivo) !== norm(b.objetivo)) importantes.push("Cambia el objetivo del agente.");
  if (norm(a.rol) !== norm(b.rol)) importantes.push("Cambia el rol del agente.");
  if (norm(a.nunca_hace) !== norm(b.nunca_hace)) {
    if (norm(b.nunca_hace).includes(norm(a.nunca_hace))) menores.push("Se amplía «lo que nunca hace».");
    else importantes.push("Se quitan o reescriben límites de «lo que nunca hace».");
  }
  if (norm(a.tono) !== norm(b.tono)) menores.push("Cambia el tono.");
  if (norm(a.negocio_resumen) !== norm(b.negocio_resumen)) menores.push("Cambia la descripción del negocio.");
  if (norm(a.nombre) !== norm(b.nombre)) menores.push("Cambia el nombre del agente.");
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (!FICHA_CONOCIDA.has(k) && !igual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k])) importantes.push(`Cambia «${k}» en la ficha (cambio no reconocido).`);
  }

  // — Plantilla
  if ((versionAnterior.plantilla_version ?? null) !== (versionNueva.plantilla_version ?? null) && versionAnterior.plantilla_version != null) {
    importantes.push(`Cambia la versión de la plantilla (${versionAnterior.plantilla_version} → ${versionNueva.plantilla_version ?? "ninguna"}).`);
  }

  // — Herramientas y permisos
  const antes = new Map(versionAnterior.herramientas.map((t) => [t.tool_id, t]));
  const integracionesAntes = new Set(versionAnterior.herramientas.filter((t) => t.permiso !== "prohibida").map((t) => obtenerHerramienta(t.tool_id)?.integracion).filter(Boolean));
  for (const t of versionNueva.herramientas) {
    const previa = antes.get(t.tool_id);
    if (!previa) {
      if (t.permiso === "prohibida") { menores.push(`Se añade «${t.tool_id}» como prohibida.`); continue; }
      const integracion = obtenerHerramienta(t.tool_id)?.integracion;
      importantes.push(`Se añade la herramienta «${t.tool_id}»${integracion && !integracionesAntes.has(integracion) ? ` (integración nueva: ${integracion})` : ""}.`);
      continue;
    }
    if (RANGO[t.permiso] === undefined || RANGO[previa.permiso] === undefined) importantes.push(`Permiso no reconocido en «${t.tool_id}».`);
    else if (RANGO[t.permiso] < RANGO[previa.permiso]) importantes.push(`Se amplía el permiso de «${t.tool_id}» (${previa.permiso} → ${t.permiso}).`);
    else if (RANGO[t.permiso] > RANGO[previa.permiso]) menores.push(`Se endurece el permiso de «${t.tool_id}» (${previa.permiso} → ${t.permiso}).`);
    const la = previa.limite_diario ?? Infinity, lb = t.limite_diario ?? Infinity;
    if (la < lb) importantes.push(`Sube el límite diario de «${t.tool_id}».`);
    else if (la > lb) menores.push(`Baja el límite diario de «${t.tool_id}».`);
  }
  const ahora = new Set(versionNueva.herramientas.map((t) => t.tool_id));
  for (const t of versionAnterior.herramientas) if (!ahora.has(t.tool_id)) menores.push(`Se quita la herramienta «${t.tool_id}».`);

  // — Traspasos
  const claveT = (t: ConfigVersion["traspasos"][number]) => `${t.agent_id_destino}|${t.tipo_traspaso}`;
  const trasAntes = new Map(versionAnterior.traspasos.filter((t) => t.activo).map((t) => [claveT(t), t]));
  const trasAhora = new Map(versionNueva.traspasos.filter((t) => t.activo).map((t) => [claveT(t), t]));
  for (const [k, t] of trasAhora) {
    const previo = trasAntes.get(k);
    if (!previo) importantes.push(`Hay un traspaso nuevo (${t.tipo_traspaso}).`);
    else if (norm(previo.condicion) !== norm(t.condicion)) importantes.push(`Cambia la condición de un traspaso (${t.tipo_traspaso}).`);
  }
  for (const [k, t] of trasAntes) if (!trasAhora.has(k)) menores.push(`Se quita o desactiva un traspaso (${t.tipo_traspaso}).`);

  // — Reglas
  const ra = versionAnterior.reglas as Record<string, unknown> | null, rb = versionNueva.reglas as Record<string, unknown> | null;
  if (ra && !rb) importantes.push("Se quitan las reglas del agente.");
  else if (!ra && rb) menores.push("Se configuran las reglas del agente (horario, mensajes, idioma).");
  else if (ra && rb) {
    const num = (v: unknown) => (typeof v === "number" ? v : Infinity);
    if (num(ra.max_mensajes_dia) < num(rb.max_mensajes_dia)) importantes.push("Sube el límite de mensajes diarios.");
    else if (num(ra.max_mensajes_dia) > num(rb.max_mensajes_dia)) menores.push("Baja el límite de mensajes diarios.");
    if (num(ra.tope_creditos_mes) < num(rb.tope_creditos_mes)) importantes.push("Sube el tope de créditos del mes.");
    else if (num(ra.tope_creditos_mes) > num(rb.tope_creditos_mes)) menores.push("Baja el tope de créditos del mes.");
    if (ra.fuera_de_horario !== rb.fuera_de_horario) {
      if (ra.fuera_de_horario === "no_responder") importantes.push("Fuera de horario ya no deja de responder.");
      else menores.push("Cambia qué hace fuera de horario.");
    }
    const avA = norm(ra.aviso_ia_texto as string | null), avB = norm(rb.aviso_ia_texto as string | null);
    if (avA && !avB) importantes.push("Se quita el aviso de IA.");
    else if (avA !== avB) menores.push("Cambia el texto del aviso de IA.");
    for (const [k, etiqueta] of Object.entries(REGLAS_MENORES)) if (!igual(ra[k], rb[k])) menores.push(`Cambia ${etiqueta}.`);
    for (const k of new Set([...Object.keys(ra), ...Object.keys(rb)])) {
      if (!REGLAS_CONOCIDAS.has(k) && !igual(ra[k], rb[k])) importantes.push(`Cambia la regla «${k}» (cambio no reconocido).`);
    }
  }

  // — Correcciones aprendidas: añadir es menor (pasan el examen); quitar o reescribir una es relajar una regla.
  if (versionAnterior.correcciones && versionNueva.correcciones) {
    const cAntes = new Map(versionAnterior.correcciones.map((c) => [c.id, norm(c.regla)]));
    const cAhora = new Map(versionNueva.correcciones.map((c) => [c.id, norm(c.regla)]));
    let nuevas = 0;
    for (const [id, regla] of cAhora) {
      if (!cAntes.has(id)) nuevas++;
      else if (cAntes.get(id) !== regla) importantes.push("Se reescribe una corrección aprendida.");
    }
    if (nuevas) menores.push(nuevas === 1 ? "Se añade una corrección aprendida." : `Se añaden ${nuevas} correcciones aprendidas.`);
    const quitadas = [...cAntes.keys()].filter((id) => !cAhora.has(id)).length;
    if (quitadas) importantes.push(quitadas === 1 ? "Se retira una corrección aprendida." : `Se retiran ${quitadas} correcciones aprendidas.`);
  } else if (versionAnterior.correcciones?.length && !versionNueva.correcciones) {
    importantes.push("La versión nueva no indica sus correcciones aprendidas.");
  }

  // — Cualquier otra parte de la foto que cambie y estas reglas no conozcan: ante la duda, importante.
  const x = versionAnterior as Record<string, unknown>, y = versionNueva as Record<string, unknown>;
  for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) {
    if (!RAIZ_CONOCIDA.has(k) && !igual(x[k], y[k])) importantes.push(`Cambia «${k}» (cambio no reconocido).`);
  }

  if (importantes.length) return { tipo: "importante", motivos: importantes };
  return { tipo: "menor", motivos: menores.length ? menores : ["Sin cambios de configuración relevantes."] };
}

export type Clasificacion = { tipo: "nueva" | "cambio_menor" | "cambio_importante"; motivos: string[] };

/** Tipo de solicitud de certificación: «nueva» si no hay versión certificada; si la hay, según `clasificarCambio`. */
export function clasificarSolicitud(certificada: ConfigVersion | null, enviada: ConfigVersion): Clasificacion {
  if (!certificada) return { tipo: "nueva", motivos: ["El agente no tiene ninguna versión certificada."] };
  const c = clasificarCambio(certificada, enviada);
  return { tipo: c.tipo === "menor" ? "cambio_menor" : "cambio_importante", motivos: c.motivos };
}
