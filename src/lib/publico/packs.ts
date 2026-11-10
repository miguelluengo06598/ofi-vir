import { cacheLife } from "next/cache";
import { getPacks, type Pack } from "@/lib/creditos/packs";

/**
 * Packs activos para la web pública, leídos de `credit_packs` (nunca escritos a mano).
 * Se cachean una hora; si la base no responde, se devuelve null y se reintenta en pocos minutos.
 */
export async function packsPublicos(): Promise<Pack[] | null> {
  "use cache";
  try {
    const packs = await getPacks();
    cacheLife("hours");
    return packs;
  } catch {
    cacheLife({ stale: 300, revalidate: 300, expire: 3600 });
    return null;
  }
}
