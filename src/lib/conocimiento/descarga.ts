/**
 * Descarga de páginas web para el conocimiento. SOLO SERVIDOR.
 * La URL la escribe una persona y el servidor la visita: es el patrón clásico de SSRF (hacer que el servidor llame a su
 * propia red interna, a la nube de metadatos, etc.). Por eso:
 *  - solo http/https, sin usuario ni contraseña en la URL y solo los puertos 80/443;
 *  - la dirección IP se comprueba AL CONECTAR (no antes), con la misma que se usa para conectar: no vale cambiar el DNS entre medias;
 *  - se rechazan direcciones privadas, locales, de enlace local, de nube y reservadas (IPv4 e IPv6, también las «mapeadas»);
 *  - cada redirección se vuelve a comprobar entera y no puede salir del sitio;
 *  - tiempo máximo y tamaño máximo por página; solo texto/HTML; sin cookies ni cabeceras de la empresa.
 * `permitirRedLocal` existe SOLO para los tests con un servidor local; nunca se activa desde la API.
 */
import { BlockList, isIP } from "node:net";
import dns from "node:dns";
import http from "node:http";
import https from "node:https";
import { mismoSitio } from "./html.ts";

export class ErrorDescarga extends Error {
  readonly codigo: "url_no_valida" | "direccion_no_permitida" | "tiempo" | "demasiado_grande" | "tipo_no_admitido" | "red" | "redireccion";
  constructor(codigo: ErrorDescarga["codigo"], mensaje: string) {
    super(mensaje);
    this.codigo = codigo;
  }
}

const PRIVADAS = new BlockList();
for (const [d, p] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24],
  ["192.0.2.0", 24], ["192.88.99.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 3],
] as [string, number][]) PRIVADAS.addSubnet(d, p, "ipv4");
for (const [d, p] of [["::", 128], ["::1", 128], ["fc00::", 7], ["fe80::", 10], ["ff00::", 8], ["2001:db8::", 32], ["64:ff9b::", 96], ["100::", 64]] as [string, number][]) PRIVADAS.addSubnet(d, p, "ipv6");

/** true si la dirección no es una IP pública de Internet. */
export function esDireccionPrivada(ip: string): boolean {
  const limpia = ip.replace(/^\[|\]$/g, "").replace(/%.*$/, "");
  const mapeada = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(limpia);
  if (mapeada) return esDireccionPrivada(mapeada[1]);
  const v = isIP(limpia);
  if (v === 0) return true;
  return PRIVADAS.check(limpia, v === 4 ? "ipv4" : "ipv6");
}

export type OpcionesDescarga = {
  userAgent: string;
  /** Por página (ms). */
  timeoutMs: number;
  /** Por página (bytes). */
  maxBytes: number;
  /** SOLO tests. */
  permitirRedLocal?: boolean;
};

export type Respuesta = { status: number; url: string; tipo: string; texto: string };

/** Función que descarga una URL; la inyectan los tests y `leerWeb`. */
export type Descargador = (url: string, opciones?: { sitio?: string; soloTexto?: boolean }) => Promise<Respuesta>;

/** Comprobación inmediata de la URL (esquema, usuario, puerto, nombre local, IP privada). La IP final se vuelve a comprobar al conectar. */
export function comprobarUrl(u: URL, o: Pick<OpcionesDescarga, "permitirRedLocal">) {
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new ErrorDescarga("url_no_valida", "Solo se admiten direcciones http o https.");
  if (u.username || u.password) throw new ErrorDescarga("url_no_valida", "La dirección no puede llevar usuario ni contraseña.");
  if (!o.permitirRedLocal && u.port && u.port !== "80" && u.port !== "443") throw new ErrorDescarga("direccion_no_permitida", "Solo se admiten los puertos web normales (80 y 443).");
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (!o.permitirRedLocal) {
    if (/^localhost$|\.localhost$|\.local$|\.internal$/i.test(host)) throw new ErrorDescarga("direccion_no_permitida", "Esa dirección no es pública.");
    if (isIP(host) && esDireccionPrivada(host)) throw new ErrorDescarga("direccion_no_permitida", "Esa dirección no es pública.");
  }
}

/** `lookup` de Node que descarta direcciones privadas: la conexión usa justo la IP ya comprobada. */
function lookupSeguro(permitirRedLocal: boolean): net_lookup {
  return (hostname, opciones, cb) => {
    dns.lookup(hostname, { ...(opciones as dns.LookupOptions), all: true }, (err, direcciones) => {
      if (err) return cb(err as NodeJS.ErrnoException, "", 4);
      const buenas = (direcciones as dns.LookupAddress[]).filter((d) => permitirRedLocal || !esDireccionPrivada(d.address));
      if (buenas.length === 0) return cb(new ErrorDescarga("direccion_no_permitida", "Esa dirección no es pública.") as unknown as NodeJS.ErrnoException, "", 4);
      if ((opciones as { all?: boolean }).all) return (cb as unknown as (e: null, a: dns.LookupAddress[]) => void)(null, buenas);
      cb(null, buenas[0].address, buenas[0].family);
    });
  };
}
type net_lookup = NonNullable<http.RequestOptions["lookup"]>;

const TIPOS_ADMITIDOS = /^(?:text\/html|application\/xhtml\+xml|text\/plain)\b/i;

function decodificar(bytes: Buffer, tipo: string): string {
  let charset = /charset\s*=\s*["']?([\w-]+)/i.exec(tipo)?.[1];
  if (!charset) charset = /<meta[^>]+charset\s*=\s*["']?([\w-]+)/i.exec(bytes.subarray(0, 2048).toString("latin1"))?.[1];
  try {
    return new TextDecoder(charset ?? "utf-8").decode(bytes);
  } catch {
    return new TextDecoder("utf-8").decode(bytes);
  }
}

function pedir(u: URL, o: OpcionesDescarga): Promise<{ status: number; location: string | null; tipo: string; cuerpo: Buffer }> {
  return new Promise((resolve, reject) => {
    const modulo = u.protocol === "https:" ? https : http;
    let hecho = false;
    const fin = (f: () => void) => { if (!hecho) { hecho = true; clearTimeout(reloj); f(); } };
    const req = modulo.request(
      u,
      {
        method: "GET",
        lookup: lookupSeguro(Boolean(o.permitirRedLocal)),
        headers: { "user-agent": o.userAgent, accept: "text/html,application/xhtml+xml,text/plain;q=0.8", "accept-encoding": "identity", "accept-language": "es,en;q=0.5" },
        agent: false,
      },
      (res) => {
        const status = res.statusCode ?? 0;
        const tipo = String(res.headers["content-type"] ?? "");
        const location = typeof res.headers.location === "string" ? res.headers.location : null;
        if (status >= 300 && status < 400) { res.resume(); return fin(() => resolve({ status, location, tipo, cuerpo: Buffer.alloc(0) })); }
        if (status === 200 && tipo && !TIPOS_ADMITIDOS.test(tipo)) { res.destroy(); return fin(() => reject(new ErrorDescarga("tipo_no_admitido", "La página no es HTML ni texto."))); }
        const largo = Number(res.headers["content-length"]);
        if (Number.isFinite(largo) && largo > o.maxBytes) { res.destroy(); return fin(() => reject(new ErrorDescarga("demasiado_grande", "La página es demasiado grande."))); }
        const trozos: Buffer[] = [];
        let total = 0;
        res.on("data", (c: Buffer) => {
          total += c.length;
          if (total > o.maxBytes) { res.destroy(); return fin(() => reject(new ErrorDescarga("demasiado_grande", "La página es demasiado grande."))); }
          trozos.push(c);
        });
        res.on("end", () => fin(() => resolve({ status, location, tipo, cuerpo: Buffer.concat(trozos) })));
        res.on("error", () => fin(() => reject(new ErrorDescarga("red", "Se cortó la conexión."))));
      },
    );
    const reloj = setTimeout(() => { req.destroy(); fin(() => reject(new ErrorDescarga("tiempo", "La página tardó demasiado en responder."))); }, o.timeoutMs);
    req.on("error", (e) => fin(() => reject(e instanceof ErrorDescarga ? e : (e as { cause?: unknown }).cause instanceof ErrorDescarga ? (e as { cause: ErrorDescarga }).cause : new ErrorDescarga("red", "No se pudo conectar con la página."))));
    req.end();
  });
}

const MAX_REDIRECCIONES = 3;

/** Crea el descargador seguro. Las redirecciones se siguen a mano y solo dentro del mismo sitio (si se indica). */
export function crearDescargador(o: OpcionesDescarga): Descargador {
  return async (url, extra = {}) => {
    let actual: URL;
    try { actual = new URL(url); } catch { throw new ErrorDescarga("url_no_valida", "La dirección no es válida."); }
    const sitio = extra.sitio ?? actual.hostname;
    for (let salto = 0; salto <= MAX_REDIRECCIONES; salto++) {
      comprobarUrl(actual, o);
      if (!mismoSitio(actual.hostname, sitio)) throw new ErrorDescarga("redireccion", "La redirección sale del sitio.");
      const r = await pedir(actual, o);
      if (r.status >= 300 && r.status < 400 && r.location) {
        try { actual = new URL(r.location, actual); } catch { throw new ErrorDescarga("redireccion", "Redirección no válida."); }
        continue;
      }
      return { status: r.status, url: actual.href, tipo: r.tipo, texto: decodificar(r.cuerpo, r.tipo) };
    }
    throw new ErrorDescarga("redireccion", "Demasiadas redirecciones.");
  };
}
