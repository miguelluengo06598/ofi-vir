/** Diferencias entre dos versiones de un agente, en frases que puede leer la empresa (vista de historial). Pura. */
import type { ConfigVersion } from "../../certificacion/clonar.ts";

export type Diferencia = { campo: string; antes: string | null; despues: string | null };

const FICHA: [keyof ConfigVersion["ficha"], string][] = [
  ["nombre", "Nombre"], ["rol", "Rol"], ["modelo", "Modelo de IA"], ["negocio_resumen", "Descripción del negocio"], ["tono", "Tono"],
  ["objetivo", "Objetivo"], ["nunca_hace", "Lo que nunca hace"], ["instrucciones_empresa", "Instrucciones de la empresa"],
];
const REGLAS: [string, string][] = [
  ["zona_horaria", "Zona horaria"], ["horario", "Horario"], ["fuera_de_horario", "Fuera de horario"], ["mensaje_fuera_horario", "Mensaje de fuera de horario"],
  ["max_mensajes_dia", "Máximo de mensajes al día"], ["tope_creditos_mes", "Tope de créditos al mes"], ["aviso_ia_texto", "Aviso de IA"], ["idioma", "Idioma"],
];
const PERMISO: Record<string, string> = { sola: "sin aprobación", aprobacion: "con aprobación", humano: "pasa a una persona", prohibida: "prohibida" };
const DIAS: [string, string][] = [["lun", "L"], ["mar", "M"], ["mie", "X"], ["jue", "J"], ["vie", "V"], ["sab", "S"], ["dom", "D"]];

const texto = (v: unknown): string | null => {
  if (v === null || v === undefined || v === "") return null;
  return typeof v === "string" ? v : typeof v === "number" || typeof v === "boolean" ? String(v) : JSON.stringify(v);
};
export function horarioEnTexto(h: unknown): string | null {
  if (!h || typeof h !== "object") return null;
  const partes = DIAS.flatMap(([k, letra]) => {
    const tramos = (h as Record<string, unknown>)[k];
    return Array.isArray(tramos) && tramos.length ? [`${letra} ${tramos.map((t) => (Array.isArray(t) ? t.join("-") : String(t))).join(", ")}`] : [];
  });
  return partes.length ? partes.join(" · ") : "Sin horario";
}
const permiso = (t: { permiso: string; limite_diario: number | null }) => `${PERMISO[t.permiso] ?? t.permiso}${t.limite_diario != null ? ` (máx. ${t.limite_diario}/día)` : ""}`;

/** `nombres`: nombre de cada agente destino de traspaso (por id), para no enseñar identificadores. */
export function diferenciasEntre(anterior: ConfigVersion | null, nueva: ConfigVersion, nombres: Record<string, string> = {}): Diferencia[] {
  if (!anterior) return [];
  const out: Diferencia[] = [];
  const dif = (campo: string, a: unknown, b: unknown, fmt: (v: unknown) => string | null = texto) => {
    if (JSON.stringify(a ?? null) !== JSON.stringify(b ?? null)) out.push({ campo, antes: fmt(a), despues: fmt(b) });
  };
  for (const [k, etiqueta] of FICHA) dif(etiqueta, anterior.ficha[k], nueva.ficha[k]);
  if (anterior.plantilla_version != null || nueva.plantilla_version != null) dif("Versión de la plantilla", anterior.plantilla_version, nueva.plantilla_version, (v) => (v == null ? null : `v${v}`));

  const hA = new Map(anterior.herramientas.map((t) => [t.tool_id, t])), hB = new Map(nueva.herramientas.map((t) => [t.tool_id, t]));
  for (const id of [...new Set([...hA.keys(), ...hB.keys()])].sort()) {
    const a = hA.get(id), b = hB.get(id);
    const ta = a ? permiso(a) : null, tb = b ? permiso(b) : null;
    if (ta !== tb) out.push({ campo: `Herramienta «${id}»`, antes: ta, despues: tb });
  }

  const ra = (anterior.reglas ?? {}) as Record<string, unknown>, rb = (nueva.reglas ?? {}) as Record<string, unknown>;
  for (const [k, etiqueta] of REGLAS) dif(etiqueta, ra[k], rb[k], k === "horario" ? horarioEnTexto : texto);

  const destino = (id: string) => nombres[id] ?? "otro agente";
  const clave = (t: ConfigVersion["traspasos"][number]) => `${t.agent_id_destino}|${t.tipo_traspaso}|${t.condicion}`;
  const tA = new Map(anterior.traspasos.filter((t) => t.activo).map((t) => [clave(t), t])), tB = new Map(nueva.traspasos.filter((t) => t.activo).map((t) => [clave(t), t]));
  for (const [k, t] of tB) if (!tA.has(k)) out.push({ campo: `Traspaso a ${destino(t.agent_id_destino)} (${t.tipo_traspaso})`, antes: null, despues: t.condicion });
  for (const [k, t] of tA) if (!tB.has(k)) out.push({ campo: `Traspaso a ${destino(t.agent_id_destino)} (${t.tipo_traspaso})`, antes: t.condicion, despues: null });

  if (anterior.correcciones && nueva.correcciones) {
    const cA = new Map(anterior.correcciones.map((c) => [c.id, c.regla])), cB = new Map(nueva.correcciones.map((c) => [c.id, c.regla]));
    for (const [id, regla] of cB) if (cA.get(id) !== regla) out.push({ campo: "Corrección aprendida", antes: cA.get(id) ?? null, despues: regla });
    for (const [id, regla] of cA) if (!cB.has(id)) out.push({ campo: "Corrección aprendida", antes: regla, despues: null });
  }
  return out;
}
