import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const next = req.nextUrl.searchParams.get("next");
  const destino = next?.startsWith("/") && !next.startsWith("//") ? next : "/oficina";
  const respuesta = NextResponse.redirect(new URL(destino, req.url));
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!code || !url || !key) return NextResponse.redirect(new URL("/login?error=enlace_no_valido", req.url));
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (items) => items.forEach(({ name, value, options }) => respuesta.cookies.set(name, value, options)),
    },
  });
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  return error ? NextResponse.redirect(new URL("/login?error=enlace_no_valido", req.url)) : respuesta;
}
