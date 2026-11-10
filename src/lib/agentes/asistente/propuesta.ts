import type { Permiso } from "../herramientas/tipos.ts";
import { CAMPOS_APLICABLES, type CampoAplicable, type Propuesta } from "./esquemas.ts";
import type { CambiosAplicar, ContextoAgente } from "./tipos.ts";

/**
 * Problemas de una propuesta frente a lo que el agente permite. Lista vacía = se puede aplicar.
 * Esta es la comprobación que decide, nunca la IA: la usa tanto el saneado (que descarta) como el aplicar (que rechaza).
 */
export function problemasDePropuesta(p: Pick<Propuesta, "permisos" | "traspasos">, c: ContextoAgente): string[] {
  const problemas: string[] = [];
  const porId = new Map(c.herramientas.map((h) => [h.id, h]));
  for (const x of p.permisos) {
    const h = porId.get(x.herramienta_id);
    if (!h) problemas.push(`La herramienta «${x.herramienta_id}» no está disponible para este agente.`);
    else if (!h.editable && x.permiso !== h.permisoDefecto) {
      problemas.push(`«${h.nombre}» no permite cambiar su permiso: la plantilla lo deja en «${h.permisoDefecto}», no en «${x.permiso}».`);
    }
  }
  const destinos = new Set(c.otrosAgentes.map((o) => o.id));
  for (const t of p.traspasos) {
    if (t.agente_id === c.agente.id) problemas.push("Un agente no puede traspasarse trabajo a sí mismo.");
    else if (!destinos.has(t.agente_id)) problemas.push(`El agente de destino ${t.agente_id} no existe en vuestra oficina.`);
  }
  return problemas;
}

/**
 * Deja la propuesta lista para mostrar: descarta lo que el agente no permite (con aviso para la empresa), quita duplicados
 * y, en un agente de plantilla, completa los permisos de las herramientas que el modelo no ha mencionado (actual o por defecto).
 */
export function sanearPropuesta(raw: Propuesta, c: ContextoAgente): { propuesta: Propuesta; avisos: string[] } {
  const avisos: string[] = [];
  const porId = new Map(c.herramientas.map((h) => [h.id, h]));

  const permisos = new Map<string, Propuesta["permisos"][number]>();
  for (const x of raw.permisos) {
    const h = porId.get(x.herramienta_id);
    if (!h) { avisos.push(`He ignorado la herramienta «${x.herramienta_id}»: este agente no la tiene.`); continue; }
    if (!h.editable && x.permiso !== h.permisoDefecto) {
      avisos.push(`No se puede cambiar el permiso de «${h.nombre}» (queda en «${h.permisoDefecto}»): la plantilla no lo permite.`);
      permisos.set(h.id, { herramienta_id: h.id, permiso: h.permisoDefecto, motivo: "Fijado por la plantilla" });
      continue;
    }
    permisos.set(h.id, x);
  }
  if (c.agente.templateId) {
    for (const h of c.herramientas) {
      if (!permisos.has(h.id)) permisos.set(h.id, { herramienta_id: h.id, permiso: h.permisoActual ?? h.permisoDefecto, motivo: "Sin cambios" });
    }
  }

  const existentes = new Set(c.traspasosActuales.map((t) => `${t.destinoId}|${t.condicion}`));
  const destinos = new Set(c.otrosAgentes.map((o) => o.id));
  const vistos = new Set<string>();
  const traspasos: Propuesta["traspasos"] = [];
  for (const t of raw.traspasos) {
    const clave = `${t.agente_id}|${t.condicion}`;
    if (!destinos.has(t.agente_id)) { avisos.push("He ignorado un traspaso hacia un agente que no existe en vuestra oficina."); continue; }
    if (vistos.has(clave) || existentes.has(clave)) continue;
    vistos.add(clave);
    traspasos.push(t);
  }

  return { propuesta: { ...raw, permisos: [...permisos.values()], traspasos }, avisos };
}

/** Qué permisos de la propuesta cambian algo respecto al estado actual del agente. */
export function permisosQueCambian(p: Propuesta, c: ContextoAgente): { herramienta_id: string; de: Permiso | null; a: Permiso }[] {
  const actual = new Map(c.herramientas.map((h) => [h.id, h.permisoActual]));
  return p.permisos.filter((x) => actual.get(x.herramienta_id) !== x.permiso).map((x) => ({ herramienta_id: x.herramienta_id, de: actual.get(x.herramienta_id) ?? null, a: x.permiso }));
}

/** Traduce la propuesta (o solo los campos marcados) a lo que entiende la función SQL de aplicar. */
export function cambiosDesdePropuesta(p: Propuesta, campos: readonly CampoAplicable[] = CAMPOS_APLICABLES): CambiosAplicar {
  const quiere = new Set(campos);
  const cambios: CambiosAplicar = {};
  const ficha: NonNullable<CambiosAplicar["ficha"]> = {};
  for (const k of ["negocio_resumen", "tono", "objetivo", "nunca_hace", "instrucciones_empresa"] as const) if (quiere.has(k)) ficha[k] = p[k];
  if (Object.keys(ficha).length) cambios.ficha = ficha;
  if (quiere.has("reglas")) cambios.reglas = p.reglas;
  if (quiere.has("permisos")) cambios.permisos = p.permisos.map((x) => ({ tool_id: x.herramienta_id, permiso: x.permiso }));
  if (quiere.has("traspasos")) cambios.traspasos = p.traspasos.map((t) => ({ agent_id_destino: t.agente_id, condicion: t.condicion, tipo_traspaso: t.tipo }));
  return cambios;
}
