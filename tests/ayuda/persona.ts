/**
 * Personas y rutinas para las pruebas contra la base: una rutina solo la crea y la activa una PERSONA de la empresa (lo exige la
 * base), así que las pruebas crean una de verdad (usuario de Auth + fila en public.users).
 */
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { altaEnEmpresa } from "./miembros.ts";

const personas = new Map<string, string>();

/** Una persona (propietaria) de la empresa; la misma en toda la ejecución. */
export async function personaDePrueba(db: SupabaseClient, companyId: string): Promise<string> {
  const ya = personas.get(companyId);
  if (ya) return ya;
  const email = `persona-${randomUUID().slice(0, 12)}@test.example`;
  const { data, error } = await db.auth.admin.createUser({ email, password: `Pw-${randomUUID()}-Aa1!`, email_confirm: true });
  if (error || !data.user) throw new Error(`No se pudo crear la persona de prueba: ${error?.message}`);
  const { error: e2 } = await altaEnEmpresa(db, { id: data.user.id, companyId, nombre: "Persona de prueba", email, rol: "propietario" });
  if (e2) throw new Error(`No se pudo crear la persona de prueba: ${e2.message}`);
  personas.set(companyId, data.user.id);
  return data.user.id;
}

/** Crea una rutina como lo haría una persona (nace desactivada) y, si se pide, la activa esa persona. */
export async function rutinaDePrueba(db: SupabaseClient, fila: Record<string, unknown> & { company_id: string }, activa = true) {
  const persona = await personaDePrueba(db, fila.company_id);
  const { activa: _ignorada, ...resto } = fila;
  void _ignorada;
  const r = await db.from("agent_routines").insert({ ...resto, creado_por: persona }).select("id").single();
  if (r.error || !activa) return r;
  const a = await db.from("agent_routines").update({ activa: true, activada_por: persona }).eq("id", r.data.id).select("id").single();
  // La activación cambia la próxima ejecución solo si se pide; se respeta la que traía la fila.
  return a.error ? a : r;
}
