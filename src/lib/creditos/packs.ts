/** Los packs viven en la tabla `credit_packs` (única fuente de verdad); aquí solo se leen, con caché en memoria. */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

export const PackSchema = z
  .object({
    id: z.enum(["prueba", "inicio", "pro", "business", "empresa"]),
    nombre: z.string().min(1),
    precio_centimos: z.number().int().positive(),
    creditos: z.number().int().positive(),
    creditos_bono_mensual: z.number().int().positive().nullable(),
    dias_caducidad: z.number().int().positive(),
    solo_una_vez: z.boolean(),
    activo: z.boolean(),
  })
  .transform((r) => ({
    id: r.id, nombre: r.nombre, precioCentimos: r.precio_centimos, creditos: r.creditos,
    creditosBonoMensual: r.creditos_bono_mensual, diasCaducidad: r.dias_caducidad,
    soloUnaVez: r.solo_una_vez, activo: r.activo,
  }));
export type Pack = z.output<typeof PackSchema>;

/** De dónde salen las filas en crudo (la base en producción; un falso en los tests). */
export type FuentePacks = () => Promise<unknown[]>;

export const TTL_CACHE_PACKS_MS = 5 * 60 * 1000;

export function fuenteSupabase(env: Record<string, string | undefined> = process.env): FuentePacks {
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY para leer los packs.");
  return fuenteDeCliente(createClient(url, key, { auth: { persistSession: false } }));
}

/** Lee los packs con un cliente de Supabase ya creado. */
export function fuenteDeCliente(db: SupabaseClient): FuentePacks {
  return async () => {
    const { data, error } = await db.from("credit_packs").select("*").order("precio_centimos");
    if (error) throw new Error(`No se pudieron leer los packs: ${error.message}`);
    return data ?? [];
  };
}

let cache: { packs: Pack[]; expiraEn: number } | null = null;
let enCurso: Promise<Pack[]> | null = null;

/** Packs activos, del más barato al más caro. Se cachean 5 minutos; las lecturas simultáneas comparten una sola consulta. */
export async function getPacks(opts: { fuente?: FuentePacks; ahora?: number; incluirInactivos?: boolean } = {}): Promise<Pack[]> {
  const ahora = opts.ahora ?? Date.now();
  if (!cache || cache.expiraEn <= ahora) {
    enCurso ??= (opts.fuente ?? fuenteSupabase())()
      .then((filas) => {
        const packs = z.array(PackSchema).parse(filas).sort((a, b) => a.precioCentimos - b.precioCentimos);
        cache = { packs, expiraEn: ahora + TTL_CACHE_PACKS_MS };
        return packs;
      })
      .finally(() => { enCurso = null; });
    await enCurso;
  }
  return opts.incluirInactivos ? cache!.packs : cache!.packs.filter((p) => p.activo);
}

export async function getPack(id: Pack["id"], opts: Parameters<typeof getPacks>[0] = {}): Promise<Pack | null> {
  return (await getPacks(opts)).find((p) => p.id === id) ?? null;
}

/** Vacía la caché (tests, o tras cambiar el catálogo). */
export function limpiarCachePacks(): void {
  cache = null;
  enCurso = null;
}
