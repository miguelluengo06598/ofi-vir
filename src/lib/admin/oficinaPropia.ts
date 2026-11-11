/**
 * La oficina propia de MyOfia: MyOfia usa su producto como una empresa más. SOLO SERVIDOR.
 *
 * No es un acceso especial: se crea con las mismas funciones atómicas que el alta de un cliente (`alta_cliente` +
 * `invitacion_aceptar`) y quien la crea queda como su propietario en `company_members`. A partir de ahí entra en
 * /oficina como cualquier persona de una empresa y solo ve esa empresa (la regla «ser de MyOfia no da acceso a los
 * datos de ninguna empresa» no cambia). Aparece en Clientes como una empresa más: créditos, implantación y estado
 * se gestionan igual, con su auditoría.
 */
import { createHash, randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { registrarAuditoria, type SesionPlataforma } from "./acceso.ts";
import { DEPARTAMENTOS_ALTA } from "./comercial/config.ts";

export type OficinaPropia = { companyId: string; nombre: string; estado: string; rol: string };
export class OficinaPropiaError extends Error {}

/** Las empresas operativas de las que esta persona es miembro activo (su oficina propia, si la tiene). */
export async function oficinasDe(db: SupabaseClient, userId: string): Promise<OficinaPropia[]> {
  const { data, error } = await db
    .from("company_members")
    .select("rol, creado_en, companies!inner(id, name, estado, es_examen)")
    .eq("user_id", userId).eq("estado", "activo").order("creado_en");
  if (error) throw new Error("No se pudieron leer tus oficinas.");
  return (data ?? [])
    .map((f) => ({ rol: f.rol as string, c: f.companies as unknown as { id: string; name: string; estado: string; es_examen: boolean } }))
    .filter((f) => !f.c.es_examen && f.c.estado !== "borrada")
    .map((f) => ({ companyId: f.c.id, nombre: f.c.name, estado: f.c.estado, rol: f.rol }));
}

const Datos = z.object({ nombre: z.string().trim().min(2, "Escribe el nombre de la oficina.").max(160) }).strict();

/** Crea la oficina de MyOfia con sus cinco departamentos y deja a quien la crea como propietario. Solo admin_samgple, una vez. */
export async function crearOficinaPropia(db: SupabaseClient, sesion: SesionPlataforma, entrada: unknown, ip: string | null): Promise<OficinaPropia> {
  if (!sesion.mfaVerificada || !sesion.roles.includes("admin_samgple")) throw new OficinaPropiaError("Solo administración puede crear la oficina de MyOfia.");
  const v = Datos.safeParse(entrada);
  if (!v.success) throw new OficinaPropiaError(v.error.issues[0]?.message ?? "Revisa el nombre.");
  if ((await oficinasDe(db, sesion.userId)).length > 0) throw new OficinaPropiaError("Ya tienes una oficina.");

  const { data: cuenta } = await db.auth.admin.getUserById(sesion.userId);
  const email = cuenta.user?.email?.toLowerCase();
  if (!email) throw new OficinaPropiaError("Tu cuenta no tiene correo: no se puede asignar la oficina.");

  // El token solo existe aquí y se usa al momento: la base guarda su huella y la invitación queda aceptada.
  const token = randomBytes(32).toString("base64url");
  const huella = createHash("sha256").update(token).digest("hex");
  const { data, error } = await db.rpc("alta_cliente", {
    p_actor: sesion.userId,
    p: {
      solicitud_id: null,
      empresa: { nombre: v.data.nombre, sector: null, tamano: null, web: null },
      fiscales: null,
      propietario: { nombre: sesion.nombre, email, token_hash: huella },
      miembros: [], servicios: [], agentes: [], creditos: null,
      departamentos: DEPARTAMENTOS_ALTA,
      responsable: sesion.userId,
      objetivo_fin: null,
    },
  });
  if (error || !data) {
    console.error("[admin/mi-oficina] alta:", error?.code ?? "sin datos");
    throw new OficinaPropiaError("No se ha creado nada: falló el alta. Inténtalo de nuevo.");
  }
  const companyId = (data as { company_id: string }).company_id;

  const aceptada = await db.rpc("invitacion_aceptar", { p_token_hash: huella, p_user_id: sesion.userId });
  if (aceptada.error) {
    console.error("[admin/mi-oficina] propietario:", aceptada.error.code);
    throw new OficinaPropiaError("La oficina se creó, pero no se te pudo asignar como propietario. Bórrala desde Clientes y vuelve a intentarlo.");
  }
  await registrarAuditoria(db, { actorId: sesion.userId, ip, accion: "plataforma.oficina_propia", companyId, objetoTipo: "company", objetoId: companyId, despues: { nombre: v.data.nombre, propietario: sesion.userId }, motivo: "Oficina propia de MyOfia" });
  return { companyId, nombre: v.data.nombre, estado: "en_implantacion", rol: "propietario" };
}
