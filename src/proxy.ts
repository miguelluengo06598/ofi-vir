import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { exigirRolPlataforma, sesionPlataforma, type RolPlataforma } from "@/lib/admin/acceso";
import { empresaPedida, sesionEnEmpresa } from "@/lib/empresas/sesion";

const RUTAS_OFICINA = ["/oficina", "/agentes", "/aprobaciones", "/conexiones", "/creditos", "/cuenta", "/estado", "/favoritos", "/marketplace", "/memoria", "/mensajes", "/miembros", "/puesta-en-marcha", "/tareas"];
const API_EXTERNA = ["/api/webhooks/", "/api/cron/", "/api/demo-oauth/"];
const API_SOLO_PERSONA = ["/api/empresas", "/api/empresas/activa", "/api/invitaciones/aceptar"];

const esOficina = (ruta: string) => RUTAS_OFICINA.some((base) => ruta === base || ruta.startsWith(`${base}/`));
const esExterna = (ruta: string) => API_EXTERNA.some((base) => ruta.startsWith(base));
const esSoloPersona = (ruta: string) => API_SOLO_PERSONA.includes(ruta);
const RUTAS_PUBLICAS = ["/", "/producto", "/equipo-conectado", "/como-empezar", "/precios", "/seguridad", "/aviso-legal", "/privacidad", "/cookies", "/condiciones"];
const SECCIONES_PUBLICAS = ["/departamentos", "/sectores"];
const esPublica = (ruta: string) => RUTAS_PUBLICAS.includes(ruta) || SECCIONES_PUBLICAS.some((b) => ruta === b || ruta.startsWith(`${b}/`));

/**
 * Qué roles de plataforma abren cada zona de /admin (admin_samgple entra siempre; la MFA se exige antes).
 * Comprobación optimista: cada página y cada acción vuelve a exigir su rol concreto en el servidor.
 */
const ROLES_ADMIN: { base: string; exacta?: boolean; roles: RolPlataforma[] }[] = [
  { base: "/admin", exacta: true, roles: ["comercial_samgple", "implantacion_samgple", "revisor_samgple", "soporte_samgple", "finanzas_samgple"] },
  { base: "/admin/certificacion", roles: ["revisor_samgple"] },
  { base: "/admin/clientes", roles: ["comercial_samgple", "implantacion_samgple", "soporte_samgple", "finanzas_samgple"] },
  { base: "/admin/comercial", roles: ["comercial_samgple"] },
  { base: "/admin/implantacion", roles: ["implantacion_samgple", "comercial_samgple", "soporte_samgple"] },
];
function rolesDeRutaAdmin(ruta: string): RolPlataforma[] {
  const zona = ROLES_ADMIN.find((z) => (z.exacta ? ruta === z.base : ruta === z.base || ruta.startsWith(`${z.base}/`)));
  return zona?.roles ?? ["finanzas_samgple"];
}

function conCookies(destino: NextResponse, origen: NextResponse) {
  origen.cookies.getAll().forEach((cookie) => destino.cookies.set(cookie));
  return destino;
}

function login(req: NextRequest, respuesta: NextResponse) {
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  url.searchParams.set("next", `${req.nextUrl.pathname}${req.nextUrl.search}`);
  return conCookies(NextResponse.redirect(url), respuesta);
}

/** En Next 16 se llama Proxy (antes middleware): refresca la sesión y hace comprobaciones optimistas. */
export async function proxy(req: NextRequest) {
  // Web pública: estática y sin sesión; no hace falta preguntar a Supabase por el usuario.
  if (esPublica(req.nextUrl.pathname)) return NextResponse.next();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return NextResponse.next();

  let respuesta = NextResponse.next({ request: { headers: req.headers } });
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (cookies) => {
        cookies.forEach(({ name, value }) => req.cookies.set(name, value));
        respuesta = NextResponse.next({ request: { headers: req.headers } });
        cookies.forEach(({ name, value, options }) => respuesta.cookies.set(name, value, options));
      },
    },
  });
  const { data: { user } } = await supabase.auth.getUser();
  const ruta = req.nextUrl.pathname;

  if (ruta === "/login" && user) {
    const destino = req.nextUrl.clone();
    destino.pathname = "/oficina";
    destino.search = "";
    return conCookies(NextResponse.redirect(destino), respuesta);
  }

  const requiereSesion = ruta.startsWith("/admin") || esOficina(ruta) || (ruta.startsWith("/api/") && !esExterna(ruta));
  if (requiereSesion && !user) {
    if (ruta.startsWith("/api/")) return conCookies(NextResponse.json({ error: "no_autenticado", mensaje: "Inicia sesión para continuar." }, { status: 401 }), respuesta);
    return login(req, respuesta);
  }
  if (!user) return respuesta;

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return respuesta;
  const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  if (ruta.startsWith("/admin")) {
    const plataforma = await sesionPlataforma(req.headers, db);
    if (!plataforma) return conCookies(new NextResponse("No encontrado", { status: 404, headers: { "cache-control": "no-store" } }), respuesta);
    if (!plataforma.mfaVerificada && ruta !== "/admin/mfa") {
      const destino = req.nextUrl.clone();
      destino.pathname = "/admin/mfa";
      destino.search = "";
      return conCookies(NextResponse.redirect(destino), respuesta);
    }
    if (ruta === "/admin/mfa") return respuesta;
    if (await exigirRolPlataforma(rolesDeRutaAdmin(ruta), req.headers, db)) return respuesta;
    return conCookies(new NextResponse("No encontrado", { status: 404, headers: { "cache-control": "no-store" } }), respuesta);
  }
  // Estas rutas se usan antes de disponer de una primera oficina; sus handlers validan la persona.
  if (esSoloPersona(ruta)) return respuesta;

  if (esOficina(ruta) || (ruta.startsWith("/api/") && !esExterna(ruta))) {
    const sesion = await sesionEnEmpresa(db, user.id, empresaPedida(req.headers));
    if (sesion) return respuesta;
    if (ruta.startsWith("/api/")) return conCookies(NextResponse.json({ error: "sin_oficina", mensaje: "Tu cuenta no pertenece a ninguna oficina activa." }, { status: 403 }), respuesta);
  }
  return respuesta;
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|mp4|webm)$).*)"] };
