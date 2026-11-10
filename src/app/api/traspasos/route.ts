import { createClient } from "@supabase/supabase-js";
import { autenticadorSupabase } from "@/lib/creditos/api";
import { traspasosHandler } from "@/lib/agentes/traspasos/api";

/** Ver src/lib/agentes/traspasos/api.ts: la empresa sale de la sesión. */
export async function GET(req: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return Response.json({ error: "backend_sin_configurar" }, { status: 503 });
  const db = createClient(url, key, { auth: { persistSession: false } });
  return traspasosHandler(req, { db, autenticar: autenticadorSupabase(db) });
}
