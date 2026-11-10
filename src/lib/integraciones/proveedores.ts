/**
 * Registro de proveedores de integraciones (aplicaciones externas que una empresa puede conectar). Una sola fuente de verdad:
 * lo que ve la empresa, lo que necesita el flujo OAuth y qué herramientas habilita cada proveedor.
 *  - Las URLs y credenciales de cada proveedor salen de variables de entorno `CONEXION_<ID>_*` (nunca del código ni del navegador).
 *  - Las herramientas que habilita se DERIVAN del registro de herramientas (`integracion` de cada una): no se repiten a mano.
 *  - Un proveedor sin configurar aparece como «no disponible» y no se puede conectar.
 * Las integraciones reales (HubSpot, Google Calendar, Meta, WhatsApp) llegarán con su propio código; aquí solo el marco.
 */
import { REGISTRO } from "../agentes/herramientas/registro.ts";

export const TIPOS_AUTH = ["oauth2", "api_key", "dominio"] as const;
export type TipoAuth = (typeof TIPOS_AUTH)[number];
export type Env = Record<string, string | undefined>;

export type Proveedor = {
  /** Es también el `integracion` de las herramientas y el `proveedor` de company_connections. */
  id: string;
  nombre: string;
  /** Ruta en /public (los logos reales se añaden con cada integración). */
  logo: string;
  descripcion: string;
  tipoAuth: TipoAuth;
  /** Permisos que se piden al conectar (OAuth). */
  scopes: string[];
  /** El proveedor admite PKCE (S256): se usa siempre que pueda. */
  pkce: boolean;
  /** Solo para probar en local: nunca disponible en producción. */
  demo?: boolean;
};

export const PROVEEDORES: readonly Proveedor[] = Object.freeze([
  {
    id: "demo", nombre: "Aplicación de demostración", logo: "/integraciones/demo.svg", demo: true, tipoAuth: "oauth2", pkce: true,
    descripcion: "Simula una aplicación externa para probar el flujo de conexión sin cuentas reales. Solo en local.",
    scopes: ["cuenta.leer"],
  },
  {
    id: "hubspot", nombre: "HubSpot", logo: "/integraciones/hubspot.svg", tipoAuth: "oauth2", pkce: false,
    descripcion: "CRM: contactos, notas y fusiones.",
    scopes: ["crm.objects.contacts.read", "crm.objects.contacts.write"],
  },
  {
    id: "google_calendar", nombre: "Google Calendar", logo: "/integraciones/google_calendar.svg", tipoAuth: "oauth2", pkce: true,
    descripcion: "Agenda: ver huecos y crear citas.",
    scopes: ["https://www.googleapis.com/auth/calendar.events", "https://www.googleapis.com/auth/calendar.freebusy"],
  },
  {
    id: "meta_ads", nombre: "Meta Ads", logo: "/integraciones/meta_ads.svg", tipoAuth: "oauth2", pkce: false,
    descripcion: "Anuncios de Facebook e Instagram: leer el rendimiento de las campañas.",
    scopes: ["ads_read"],
  },
  {
    id: "whatsapp", nombre: "WhatsApp", logo: "/integraciones/whatsapp.svg", tipoAuth: "api_key", pkce: false,
    descripcion: "Responder a los clientes por WhatsApp Business.",
    scopes: [],
  },
]);

const POR_ID = new Map(PROVEEDORES.map((p) => [p.id, p]));
export const obtenerProveedor = (id: string): Proveedor | undefined => POR_ID.get(id);
/** Nombre para mostrar; si no es un proveedor conocido, el propio id. */
export const nombreDeProveedor = (id: string) => POR_ID.get(id)?.nombre ?? id;

/** Herramientas que habilita (derivado del registro: las que declaran `integracion: <id>`). */
export const herramientasQueHabilita = (id: string) => REGISTRO.filter((h) => h.integracion === id).map((h) => ({ id: h.id, nombre: h.nombre }));

// ── Configuración desde el entorno ──────────────────────────────────────────────────────────────────────────────────────
export const esProduccion = (env: Env = process.env) => env.NODE_ENV === "production";
export const demoHabilitado = (env: Env = process.env) => env.CONEXIONES_DEMO === "true" && !esProduccion(env);

/** Dirección pública de la aplicación (para el `redirect_uri`). En producción es obligatoria. */
export function urlDeLaApp(env: Env = process.env): string | null {
  const u = env.APP_URL?.trim().replace(/\/+$/, "");
  if (u) return u;
  return esProduccion(env) ? null : "http://localhost:3000";
}
export const redirectUri = (proveedorId: string, appUrl: string) => `${appUrl}/api/conexiones/${proveedorId}/callback`;

export type ConfigOAuth = { urlAutorizacion: string; urlToken: string; urlRevocar: string | null; clientId: string; clientSecret: string | null };
const clave = (id: string, sufijo: string) => `CONEXION_${id.toUpperCase()}_${sufijo}`;

/** URLs y credenciales del proveedor; null si falta algo (entonces no está disponible). */
export function configuracionOAuth(p: Proveedor, env: Env = process.env): ConfigOAuth | null {
  if (p.tipoAuth !== "oauth2") return null;
  if (p.demo) {
    if (!demoHabilitado(env)) return null;
    const app = urlDeLaApp(env);
    if (!app) return null;
    return {
      urlAutorizacion: env[clave(p.id, "AUTH_URL")] || `${app}/demo-oauth/autorizar`,
      urlToken: env[clave(p.id, "TOKEN_URL")] || `${app}/api/demo-oauth/token`,
      urlRevocar: env[clave(p.id, "REVOKE_URL")] || `${app}/api/demo-oauth/revocar`,
      clientId: env[clave(p.id, "CLIENT_ID")] || "demo-client",
      clientSecret: env[clave(p.id, "CLIENT_SECRET")] || "demo-secret",
    };
  }
  const urlAutorizacion = env[clave(p.id, "AUTH_URL")]?.trim(), urlToken = env[clave(p.id, "TOKEN_URL")]?.trim();
  const clientId = env[clave(p.id, "CLIENT_ID")]?.trim();
  if (!urlAutorizacion || !urlToken || !clientId) return null;
  for (const u of [urlAutorizacion, urlToken]) if (!/^https:\/\//.test(u) && !(!esProduccion(env) && /^http:\/\/(localhost|127\.0\.0\.1)[:/]/.test(u))) return null;
  return { urlAutorizacion, urlToken, urlRevocar: env[clave(p.id, "REVOKE_URL")]?.trim() || null, clientId, clientSecret: env[clave(p.id, "CLIENT_SECRET")]?.trim() || null };
}

/** Un proveedor se puede conectar si está configurado (y, el de demo, solo en local con CONEXIONES_DEMO=true). */
export function estaDisponible(p: Proveedor, env: Env = process.env): boolean {
  if (p.demo && !demoHabilitado(env)) return false;
  if (p.tipoAuth === "oauth2") return configuracionOAuth(p, env) !== null;
  return true; // api_key y dominio no necesitan URLs
}

/** Ficha pública: nunca incluye secretos ni URLs con credenciales. */
export const fichaDeProveedor = (p: Proveedor, env: Env = process.env) => ({
  id: p.id, nombre: p.nombre, logo: p.logo, descripcion: p.descripcion, tipoAuth: p.tipoAuth, scopes: p.scopes,
  herramientas: herramientasQueHabilita(p.id), disponible: estaDisponible(p, env), demo: Boolean(p.demo),
});
