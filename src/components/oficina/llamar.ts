/** Llamada a las rutas de control de la oficina. La empresa sale de la sesión en el servidor: aquí nunca se envía. */
export type Respuesta<T> = { ok: true; datos: T } | { ok: false; status: number; mensaje: string; datos: Record<string, unknown> };

export async function llamar<T = Record<string, unknown>>(ruta: string, metodo: "GET" | "POST" | "DELETE" = "GET", cuerpo?: unknown): Promise<Respuesta<T>> {
  try {
    const r = await fetch(ruta, {
      method: metodo, cache: "no-store",
      headers: cuerpo === undefined ? undefined : { "content-type": "application/json" },
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    });
    const datos = (await r.json().catch(() => ({}))) as Record<string, unknown>;
    if (!r.ok) return { ok: false, status: r.status, mensaje: typeof datos.mensaje === "string" ? datos.mensaje : "No se pudo completar la operación.", datos };
    return { ok: true, datos: datos as T };
  } catch {
    return { ok: false, status: 0, mensaje: "No se pudo contactar con el servidor.", datos: {} };
  }
}
