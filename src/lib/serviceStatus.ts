/**
 * Comprobaciones de conexión de los servicios (solo servidor).
 * Nunca devuelven claves, URLs con credenciales ni cuerpos de respuesta: solo un estado y un texto propio.
 */

export type ServiceState = "connected" | "missing" | "error";

export type ServiceStatus = {
  id: "database" | "resend" | "anthropic";
  name: string;
  state: ServiceState;
  /** Texto para la persona; escrito aquí, nunca copiado de una respuesta externa. */
  detail: string;
  /** Nombres (no valores) de las variables que faltan. */
  missing: string[];
  ms?: number;
};

const TIMEOUT_MS = 4000;

const present = (name: string) => Boolean(process.env[name]?.trim());

type Check = { id: ServiceStatus["id"]; name: string; required: string[]; run: () => Promise<Pick<ServiceStatus, "state" | "detail">> };

async function probe(url: string, headers: Record<string, string>) {
  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
    return { status: res.status };
  } catch {
    return { status: 0 };
  }
}

const checks: Check[] = [
  {
    id: "database",
    name: "Base de datos (Supabase)",
    required: ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"],
    async run() {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL!.replace(/\/$/, "");
      // La raíz de PostgREST solo responde con la clave de servicio: si contesta, la API y PostgreSQL están arriba.
      const { status } = await probe(`${url}/rest/v1/`, {
        apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}`,
      });
      if (status === 200) return { state: "connected", detail: "PostgreSQL responde a través de la API de Supabase." };
      if (status === 0) return { state: "error", detail: "No responde. ¿Está arrancado Supabase? Ejecuta npm run dev:all." };
      if (status === 401 || status === 403) return { state: "error", detail: "Supabase rechaza la clave de servicio. Revisa SUPABASE_SERVICE_ROLE_KEY." };
      return { state: "error", detail: `Respuesta inesperada de Supabase (HTTP ${status}).` };
    },
  },
  {
    id: "resend",
    name: "Correo (Resend)",
    required: ["RESEND_API_KEY"],
    async run() {
      // Listar dominios no envía nada ni cuesta dinero.
      const { status } = await probe("https://api.resend.com/domains", { Authorization: `Bearer ${process.env.RESEND_API_KEY!}` });
      if (status === 200) return { state: "connected", detail: "La clave de Resend es válida." };
      if (status === 0) return { state: "error", detail: "No se pudo contactar con Resend (¿sin conexión?)." };
      // Una clave «solo envío» no puede listar dominios, pero demuestra que existe.
      if (status === 401 || status === 403) return { state: "connected", detail: "Clave aceptada (con permiso solo de envío)." };
      if (status === 400) return { state: "error", detail: "Resend rechaza la clave. Revisa RESEND_API_KEY." };
      return { state: "error", detail: `Respuesta inesperada de Resend (HTTP ${status}).` };
    },
  },
  {
    id: "anthropic",
    name: "Agentes (Anthropic)",
    required: ["ANTHROPIC_API_KEY"],
    async run() {
      // Listar modelos no consume tokens.
      const { status } = await probe("https://api.anthropic.com/v1/models?limit=1", {
        "x-api-key": process.env.ANTHROPIC_API_KEY!,
        "anthropic-version": "2023-06-01",
      });
      if (status === 200) return { state: "connected", detail: "La clave de Anthropic es válida." };
      if (status === 0) return { state: "error", detail: "No se pudo contactar con Anthropic (¿sin conexión?)." };
      if (status === 401 || status === 403) return { state: "error", detail: "Anthropic rechaza la clave. Revisa ANTHROPIC_API_KEY." };
      return { state: "error", detail: `Respuesta inesperada de Anthropic (HTTP ${status}).` };
    },
  },
];

export async function checkServices(): Promise<ServiceStatus[]> {
  return Promise.all(
    checks.map(async (c): Promise<ServiceStatus> => {
      const missing = c.required.filter((v) => !present(v));
      if (missing.length > 0) {
        return { id: c.id, name: c.name, state: "missing", detail: "Falta configurar en .env.local:", missing };
      }
      const started = Date.now();
      const result = await c.run().catch(() => ({ state: "error" as const, detail: "La comprobación falló de forma inesperada." }));
      return { id: c.id, name: c.name, missing: [], ms: Date.now() - started, ...result };
    }),
  );
}
