import { randomUUID } from "node:crypto";
import type { AlmacenConocimiento, Fuente, NuevaFuente } from "./tipos.ts";

/** Almacén en memoria para tests: mismo comportamiento que el de Supabase (aislamiento por empresa, estados, archivos). */
export class InMemoryAlmacenConocimiento implements AlmacenConocimiento {
  fuentes: Fuente[] = [];
  archivos = new Map<string, Uint8Array>();
  agentes = new Set<string>();
  /** Se llama al borrar una fuente (en la base real, la cascada borra sus fragmentos). */
  alBorrar: (companyId: string, id: string) => void = () => {};
  ahora = () => Date.now();

  async agenteExiste(companyId: string, agentId: string) {
    return this.agentes.has(`${companyId}:${agentId}`);
  }
  async contar(companyId: string) {
    return this.fuentes.filter((f) => f.companyId === companyId).length;
  }
  async crear(companyId: string, n: NuevaFuente): Promise<Fuente> {
    const f: Fuente = {
      ...n, companyId, estado: "procesando", error: null, fragmentos: 0, paginas: 0, avisos: [],
      creadoEn: new Date(this.ahora()).toISOString(), iniciadoEn: new Date(this.ahora()).toISOString(), procesadoEn: null,
    };
    this.fuentes.push(f);
    return { ...f };
  }
  async obtener(companyId: string, id: string) {
    const f = this.fuentes.find((x) => x.companyId === companyId && x.id === id);
    return f ? { ...f } : null;
  }
  async listar(companyId: string, filtro: { agentId?: string | null; soloOficina?: boolean } = {}) {
    return this.fuentes
      .filter((f) => f.companyId === companyId)
      .filter((f) => (filtro.soloOficina ? f.agentId === null : filtro.agentId ? f.agentId === null || f.agentId === filtro.agentId : true))
      .map((f) => ({ ...f }));
  }
  async terminar(companyId: string, id: string, r: Parameters<AlmacenConocimiento["terminar"]>[2]) {
    const f = this.fuentes.find((x) => x.companyId === companyId && x.id === id);
    if (!f || f.estado !== "procesando") return false;
    f.estado = r.estado;
    f.procesadoEn = new Date(this.ahora()).toISOString();
    if (r.estado === "listo") { f.fragmentos = r.fragmentos; f.paginas = r.paginas; f.avisos = r.avisos; f.error = null; }
    else { f.error = r.error; f.avisos = r.avisos ?? f.avisos; }
    return true;
  }
  async reiniciar(companyId: string, id: string, antiguaDespuesDeMs: number) {
    const f = this.fuentes.find((x) => x.companyId === companyId && x.id === id);
    if (!f) return null;
    const abandonada = f.estado === "procesando" && this.ahora() - Date.parse(f.iniciadoEn) > antiguaDespuesDeMs;
    if (f.estado !== "error" && !abandonada) return null;
    f.estado = "procesando"; f.error = null; f.iniciadoEn = new Date(this.ahora()).toISOString();
    return { ...f };
  }
  async borrar(companyId: string, id: string) {
    const i = this.fuentes.findIndex((x) => x.companyId === companyId && x.id === id);
    if (i < 0) return null;
    const [f] = this.fuentes.splice(i, 1);
    this.alBorrar(companyId, id);
    return f;
  }
  async subirArchivo(ruta: string, bytes: Uint8Array) {
    this.archivos.set(ruta, bytes);
  }
  async leerArchivo(ruta: string) {
    return this.archivos.get(ruta) ?? null;
  }
  async borrarArchivo(ruta: string) {
    this.archivos.delete(ruta);
  }
  nuevoId = () => randomUUID();
}
