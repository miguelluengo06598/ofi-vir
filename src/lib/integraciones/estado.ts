/**
 * `state` firmado del flujo OAuth (HMAC-SHA256). Lleva la empresa, el usuario, el proveedor, un identificador de un solo uso y la caducidad.
 * La firma impide fabricarlo o cambiarlo; el identificador (guardado en `oauth_states`) impide reutilizarlo; y en el callback se comprueba además
 * que la sesión sea la misma empresa y la misma persona que lo pidió. El verificador PKCE NO va aquí: se queda en el servidor.
 */
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const VIDA_DEL_ESTADO_MS = 10 * 60 * 1000;

export type CargaEstado = { n: string; c: string; u: string; p: string; e: number };

const b64 = (b: Buffer) => b.toString("base64url");
const firma = (cuerpo: string, secreto: string) => createHmac("sha256", secreto).update(cuerpo).digest();

/** El secreto de firma: obligatorio y largo. Sin él, las conexiones están cerradas (como el cron sin CRON_SECRET). */
export function secretoDeEstado(env: Record<string, string | undefined> = process.env): string | null {
  const s = env.CONEXIONES_STATE_SECRET?.trim() ?? "";
  return s.length >= 32 ? s : null;
}

export function firmarEstado(c: CargaEstado, secreto: string): string {
  const cuerpo = b64(Buffer.from(JSON.stringify(c)));
  return `${cuerpo}.${b64(firma(cuerpo, secreto))}`;
}

export type ResultadoEstado = { ok: true; carga: CargaEstado } | { ok: false; motivo: "formato" | "firma" | "caducado" };

export function verificarEstado(estado: string, secreto: string, ahora = Date.now()): ResultadoEstado {
  if (estado.length > 2000) return { ok: false, motivo: "formato" };
  const partes = estado.split(".");
  if (partes.length !== 2 || !/^[A-Za-z0-9_-]+$/.test(partes[0]) || !/^[A-Za-z0-9_-]+$/.test(partes[1])) return { ok: false, motivo: "formato" };
  const esperada = firma(partes[0], secreto);
  const dada = Buffer.from(partes[1], "base64url");
  if (dada.length !== esperada.length || !timingSafeEqual(dada, esperada)) return { ok: false, motivo: "firma" };
  let c: CargaEstado;
  try { c = JSON.parse(Buffer.from(partes[0], "base64url").toString("utf8")); } catch { return { ok: false, motivo: "formato" }; }
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (![c.n, c.c, c.u].every((x) => typeof x === "string" && uuid.test(x)) || typeof c.p !== "string" || typeof c.e !== "number") return { ok: false, motivo: "formato" };
  if (c.e < ahora) return { ok: false, motivo: "caducado" };
  return { ok: true, carga: c };
}

/** PKCE (RFC 7636): verificador aleatorio de 43 caracteres y su desafío S256. */
export const nuevoVerificador = () => b64(randomBytes(32));
export const desafioS256 = (verificador: string) => b64(createHash("sha256").update(verificador).digest());
