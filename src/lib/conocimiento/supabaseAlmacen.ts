import type { SupabaseClient } from "@supabase/supabase-js";
import type { AlmacenConocimiento, EstadoFuente, Fuente, NuevaFuente, TipoFuente } from "./tipos.ts";

const BUCKET = "conocimiento";
const COLS = "id, company_id, agent_id, tipo, titulo, origen, estado, error, contenido, storage_path, bytes, fragmentos, paginas, avisos, created_by, creado_en, iniciado_en, procesado_en";

const aFuente = (r: Record<string, unknown>): Fuente => ({
  id: r.id as string,
  companyId: r.company_id as string,
  agentId: (r.agent_id as string | null) ?? null,
  tipo: r.tipo as TipoFuente,
  titulo: r.titulo as string,
  origen: (r.origen as string | null) ?? null,
  estado: r.estado as EstadoFuente,
  error: (r.error as string | null) ?? null,
  contenido: (r.contenido as string | null) ?? null,
  storagePath: (r.storage_path as string | null) ?? null,
  bytes: r.bytes === null || r.bytes === undefined ? null : Number(r.bytes),
  fragmentos: Number(r.fragmentos ?? 0),
  paginas: Number(r.paginas ?? 0),
  avisos: (r.avisos as string[] | null) ?? [],
  createdBy: (r.created_by as string | null) ?? null,
  creadoEn: r.creado_en as string,
  iniciadoEn: r.iniciado_en as string,
  procesadoEn: (r.procesado_en as string | null) ?? null,
});

/** Con la clave de servicio (se salta la RLS): CADA consulta filtra por `company_id`. */
export class SupabaseAlmacenConocimiento implements AlmacenConocimiento {
  private readonly db: SupabaseClient;
  constructor(db: SupabaseClient) {
    this.db = db;
  }

  async agenteExiste(companyId: string, agentId: string) {
    const { data, error } = await this.db.from("agents").select("id").eq("company_id", companyId).eq("id", agentId).maybeSingle();
    if (error) throw new Error("No se pudo comprobar el agente.");
    return Boolean(data);
  }

  async contar(companyId: string) {
    const { count, error } = await this.db.from("agent_knowledge").select("id", { count: "exact", head: true }).eq("company_id", companyId);
    if (error) throw new Error("No se pudieron contar las fuentes.");
    return count ?? 0;
  }

  async crear(companyId: string, f: NuevaFuente): Promise<Fuente> {
    const { data, error } = await this.db
      .from("agent_knowledge")
      .insert({
        id: f.id, company_id: companyId, agent_id: f.agentId, tipo: f.tipo, titulo: f.titulo, origen: f.origen, contenido: f.contenido,
        storage_path: f.storagePath, bytes: f.bytes, created_by: f.createdBy, estado: "procesando",
      })
      .select(COLS)
      .single();
    if (error || !data) throw new Error("No se pudo guardar la fuente.");
    return aFuente(data);
  }

  async obtener(companyId: string, id: string) {
    const { data, error } = await this.db.from("agent_knowledge").select(COLS).eq("company_id", companyId).eq("id", id).maybeSingle();
    if (error) throw new Error("No se pudo leer la fuente.");
    return data ? aFuente(data) : null;
  }

  async listar(companyId: string, filtro: { agentId?: string | null; soloOficina?: boolean } = {}) {
    let q = this.db.from("agent_knowledge").select(COLS).eq("company_id", companyId).order("creado_en", { ascending: false }).limit(500);
    if (filtro.soloOficina) q = q.is("agent_id", null);
    else if (filtro.agentId) q = q.or(`agent_id.is.null,agent_id.eq.${filtro.agentId}`);
    const { data, error } = await q;
    if (error) throw new Error("No se pudieron leer las fuentes.");
    return (data ?? []).map(aFuente);
  }

  async terminar(companyId: string, id: string, r: Parameters<AlmacenConocimiento["terminar"]>[2]) {
    const cambios =
      r.estado === "listo"
        ? { estado: "listo", error: null, fragmentos: r.fragmentos, paginas: r.paginas, avisos: r.avisos, procesado_en: new Date().toISOString() }
        : { estado: "error", error: r.error, ...(r.avisos ? { avisos: r.avisos } : {}), procesado_en: new Date().toISOString() };
    const { data, error } = await this.db.from("agent_knowledge").update(cambios).eq("company_id", companyId).eq("id", id).eq("estado", "procesando").select("id");
    if (error) throw new Error("No se pudo actualizar la fuente.");
    return (data ?? []).length > 0;
  }

  async reiniciar(companyId: string, id: string, antiguaDespuesDeMs: number) {
    const f = await this.obtener(companyId, id);
    if (!f) return null;
    const abandonada = f.estado === "procesando" && Date.now() - Date.parse(f.iniciadoEn) > antiguaDespuesDeMs;
    if (f.estado !== "error" && !abandonada) return null;
    // Optimista: solo si nadie la ha tocado entre medias.
    const { data, error } = await this.db
      .from("agent_knowledge")
      .update({ estado: "procesando", error: null, iniciado_en: new Date().toISOString(), procesado_en: null })
      .eq("company_id", companyId).eq("id", id).eq("estado", f.estado).eq("iniciado_en", f.iniciadoEn)
      .select(COLS);
    if (error) throw new Error("No se pudo reiniciar la fuente.");
    return data && data.length ? aFuente(data[0]) : null;
  }

  async borrar(companyId: string, id: string) {
    const f = await this.obtener(companyId, id);
    if (!f) return null;
    // Los fragmentos (memory_nodes.knowledge_id) caen en cascada.
    const { error } = await this.db.from("agent_knowledge").delete().eq("company_id", companyId).eq("id", id);
    if (error) throw new Error("No se pudo borrar la fuente.");
    return f;
  }

  async subirArchivo(ruta: string, bytes: Uint8Array, tipoMime: string) {
    const { error } = await this.db.storage.from(BUCKET).upload(ruta, bytes, { contentType: tipoMime, upsert: false });
    if (error) throw new Error("No se pudo guardar el archivo.");
  }

  async leerArchivo(ruta: string) {
    const { data, error } = await this.db.storage.from(BUCKET).download(ruta);
    if (error || !data) return null;
    return new Uint8Array(await data.arrayBuffer());
  }

  async borrarArchivo(ruta: string) {
    const { error } = await this.db.storage.from(BUCKET).remove([ruta]);
    if (error) throw new Error("No se pudo borrar el archivo.");
  }
}
