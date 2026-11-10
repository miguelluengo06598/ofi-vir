/** «Falta conectar X»: qué aplicaciones necesita un agente (por las herramientas que tiene activas) y no están conectadas. SOLO SERVIDOR. */
import type { SupabaseClient } from "@supabase/supabase-js";
import { obtenerHerramienta } from "../agentes/herramientas/registro.ts";
import { nombreDeProveedor } from "./proveedores.ts";

export type IntegracionFaltante = {
  proveedor: string;
  nombre: string;
  /** `sin_conectar` nunca se conectó; `caducado` hay que volver a conectarla; `desconectado` la quitaron; `error`. */
  estado: "sin_conectar" | "caducado" | "desconectado" | "error";
  mensaje: string;
  herramientas: { id: string; nombre: string }[];
};

/** null si el agente no es de esa empresa. Una herramienta `prohibida` no cuenta: el agente no puede usarla. */
export async function integracionesFaltantes(db: SupabaseClient, companyId: string, agentId: string): Promise<IntegracionFaltante[] | null> {
  const { data: agente, error: e0 } = await db.from("agents").select("id").eq("company_id", companyId).eq("id", agentId).maybeSingle();
  if (e0) throw new Error("No se pudo leer el agente.");
  if (!agente) return null;
  const { data: filas, error: e1 } = await db.from("agent_tools").select("tool_id, permiso").eq("company_id", companyId).eq("agent_id", agentId).neq("permiso", "prohibida");
  if (e1) throw new Error("No se pudieron leer las herramientas del agente.");
  const { data: conex, error: e2 } = await db.from("company_connections").select("proveedor, estado").eq("company_id", companyId);
  if (e2) throw new Error("No se pudieron leer las conexiones.");
  const estados = new Map((conex ?? []).map((c) => [c.proveedor as string, c.estado as string]));

  const porProveedor = new Map<string, { id: string; nombre: string }[]>();
  for (const f of filas ?? []) {
    const h = obtenerHerramienta(f.tool_id as string);
    if (!h?.integracion) continue;
    porProveedor.set(h.integracion, [...(porProveedor.get(h.integracion) ?? []), { id: h.id, nombre: h.nombre }]);
  }
  const faltan: IntegracionFaltante[] = [];
  for (const [proveedor, herramientas] of porProveedor) {
    const estado = estados.get(proveedor);
    if (estado === "conectado") continue;
    const nombre = nombreDeProveedor(proveedor);
    faltan.push({ proveedor, nombre, estado: (estado as IntegracionFaltante["estado"] | undefined) ?? "sin_conectar", mensaje: `Falta conectar ${nombre}`, herramientas });
  }
  return faltan.sort((a, b) => a.nombre.localeCompare(b.nombre));
}
