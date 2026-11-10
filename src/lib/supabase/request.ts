import { createServerClient } from "@supabase/ssr";

/** Obtiene la persona de cookies SSR o de un Bearer explícito (útil para scripts y pruebas de API). */
export async function usuarioDeRequest(headers: Pick<Headers, "get">): Promise<{ id: string; email?: string } | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  const authorization = headers.get("authorization");
  if (authorization) {
    const token = /^Bearer (.+)$/.exec(authorization)?.[1];
    if (!token) return null;
    const { createClient } = await import("@supabase/supabase-js");
    const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await db.auth.getUser(token);
    return error || !data.user ? null : data.user;
  }
  const cookie = headers.get("cookie") ?? "";
  const db = createServerClient(url, key, {
    cookies: { getAll: () => cookie.split(/;\s*/).filter(Boolean).map((v) => { const i = v.indexOf("="); return { name: i < 0 ? v : v.slice(0, i), value: i < 0 ? "" : v.slice(i + 1) }; }), setAll: () => undefined },
  });
  const { data, error } = await db.auth.getUser();
  return error || !data.user ? null : data.user;
}
