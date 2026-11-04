import { neutralizar } from "../email/untrusted.ts";

/**
 * Detector de órdenes escondidas en contenido externo (correos, formularios). Es una red de seguridad barata y
 * explicable, NO la defensa principal: la defensa son los permisos (el agente no puede enviar nada sin aprobación)
 * y el delimitado como dato. Sirve para marcar la tarea como sospechosa y que una persona la revise.
 */

const quitarTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Texto comparable: sin invisibles ni tildes, en minúsculas y con espacios normales (así «i​gnora» o «IGNÓRA» no esquivan nada). */
export const normalizarParaDetectar = (t: string) => quitarTildes(neutralizar(t)).toLowerCase().replace(/[^\p{L}\p{N}@._+\-\s]/gu, " ").replace(/\s+/g, " ");

const VERBOS_ENVIO = "envia|enviar|enviame|envien|reenvia|reenviar|manda|mandar|remite|exporta|exportar|filtra|comparte|forward|send|email|export";
/** Datos de la empresa que nadie debería pedir por correo. «Lista de precios» no está: es una petición normal. */
const DATOS_SENSIBLES =
  "(?:(?:lista|listado|base de datos|database)\\s+(?:completa\\s+)?(?:de\\s+)?(?:(?:tus|vuestros|nuestros|los|todos los|all the|all)\\s+)?(?:clientes|contactos|usuarios|datos|facturas|cuentas|empleados|customers|contacts|users)|todos\\s+(?:los\\s+)?(?:clientes|contactos|datos)|contrasenas?|claves?|credenciales|passwords?|credentials|customer list|(?:la\\s+)?base de datos)";

const REGLAS: [string, RegExp][] = [
  ["pide ignorar las instrucciones o reglas del agente", /\b(?:ignora|ignorar|ignore|olvida|olvidate de|omite|desobedece|disregard|forget)\b(?:\s+\w+){0,3}?\s+(?:instrucciones|reglas|ordenes|normas|restricciones|instructions|rules|guidelines|prompts?)\b/],
  ["pide ignorar lo anterior", /\b(?:ignora|ignorar|ignore|olvida|forget|disregard)\s+(?:todo\s+)?(?:lo\s+)?(?:anterior|previo|previous|prior|above)\b/],
  ["intenta darle nuevas instrucciones o un nuevo papel", /\b(?:nuevas?\s+(?:instrucciones|reglas|ordenes)|a partir de ahora\s+(?:eres|debes|tienes|vas)|ahora eres|you are now|new instructions|actua como|act as)\b/],
  ["pide revelar sus instrucciones internas", /\b(?:system prompt|prompt del sistema|tus instrucciones (?:internas|originales|de sistema)|(?:revela|muestra|repite|imprime|reveal|show|print)\s+(?:tus|tu|your)\s+(?:instrucciones|prompt|reglas|instructions))\b/],
  ["pide saltarse la aprobación humana", /\b(?:sin\s+(?:pedir\s+)?(?:aprobacion|autorizacion|permiso|revision)|sin que nadie|no esperes\s+(?:a\s+)?(?:la\s+)?(?:aprobacion|autorizacion)|without (?:asking|approval|review))\b/],
  ["pide ocultar lo que hace a las personas", /\b(?:no (?:le |se lo |les )?(?:digas|cuentes|menciones|avises)|do not tell|don.t tell)\b/],
  ["se hace pasar por la empresa, un administrador o Anthropic", /\b(?:soy (?:el|la) (?:administrador|administradora|director|directora|propietario|propietaria|dueno|duena)|mensaje (?:del|de la) (?:administrador|sistema|empresa)|de parte de (?:anthropic|la direccion)|this is (?:the )?(?:admin|administrator|system)|from anthropic)\b/],
  ["pide enviar datos de la empresa a una dirección", new RegExp(`\\b(?:${VERBOS_ENVIO})\\w*\\s+(?:\\S+\\s+){0,12}?${DATOS_SENSIBLES}(?:\\s+\\S+){0,14}?\\s+\\S+@\\S+`)],
  ["pide enviar datos de la empresa a una dirección", new RegExp(`${DATOS_SENSIBLES}(?:\\s+\\S+){0,10}?\\s+(?:a|hacia|to)\\s+(?:la\\s+direccion\\s+|este\\s+correo\\s+|this\\s+address\\s+)?\\S+@\\S+`)],
];

/** Motivos por los que el texto parece traer órdenes ocultas. Vacío si no hay nada sospechoso. */
export function detectarManipulacion(texto: string): string[] {
  const n = normalizarParaDetectar(texto);
  const motivos = new Set<string>();
  for (const [motivo, re] of REGLAS) if (re.test(n)) motivos.add(motivo);
  return [...motivos];
}

/** Trozos de contenido externo (entre <contenido_externo>) de una instrucción. */
export function bloquesExternos(texto: string): string[] {
  return [...texto.matchAll(/<contenido_externo[^>]*>([\s\S]*?)<\/contenido_externo>/g)].map((m) => m[1]);
}
