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

/**
 * Token de acceso de la petición: el Bearer explícito o, si no hay cabecera Authorization, el de las cookies de
 * @supabase/ssr. Solo lo localiza: NO lo valida (para eso, `verificarToken`).
 */
export function tokenDeAcceso(headers: Pick<Headers, "get">): string | null {
  const authorization = headers.get("authorization");
  if (authorization) return /^Bearer (.+)$/.exec(authorization)?.[1] ?? null;
  const pares = (headers.get("cookie") ?? "").split(/;\s*/).map((v) => {
    const i = v.indexOf("=");
    try { return [i < 0 ? v : v.slice(0, i), i < 0 ? "" : decodeURIComponent(v.slice(i + 1))] as const; } catch { return ["", ""] as const; }
  });
  const sesion = pares.filter(([k]) => /-auth-token(?:\.\d+)?$/.test(k)).sort(([a], [b]) => a.localeCompare(b, "en", { numeric: true })).map(([, v]) => v).join("");
  if (!sesion) return null;
  try {
    const bruto = sesion.startsWith("base64-") ? Buffer.from(sesion.slice(7), "base64url").toString("utf8") : sesion;
    const token = (JSON.parse(bruto) as { access_token?: unknown }).access_token;
    return typeof token === "string" && token ? token : null;
  } catch { return null; }
}

export type PersonaVerificada = { id: string; email?: string; aal: string | null };

/**
 * Valida ESE token contra Supabase Auth (firma, caducidad y sesión viva) y devuelve la persona y su nivel de
 * autenticación (aal). El nivel se lee del mismo token que se acaba de validar: nunca de otro dato de la cookie,
 * que podría estar manipulado (p. ej. un token caducado falso con «aal2» junto a un refresh token válido).
 */
export async function verificarToken(token: string | null): Promise<PersonaVerificada | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key || !token) return null;
  const { createClient } = await import("@supabase/supabase-js");
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) return null;
  let aal: string | null = null;
  try {
    const carga = JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8")) as { aal?: unknown; sub?: unknown };
    // El token validado debe ser de esa misma persona.
    if (carga.sub === data.user.id && typeof carga.aal === "string") aal = carga.aal;
  } catch { /* sin nivel: se trata como no verificado */ }
  return { id: data.user.id, email: data.user.email, aal };
}
