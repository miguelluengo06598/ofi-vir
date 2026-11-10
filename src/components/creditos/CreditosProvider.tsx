"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { ResumenCreditos } from "@/lib/creditos/tipos";

type Estado = "cargando" | "listo" | "error";
export type ResultadoAccion = { ok: true; datos: Record<string, unknown> } | { ok: false; mensaje: string };

type Valor = {
  estado: Estado;
  resumen: ResumenCreditos | null;
  /** Vuelve a pedir el resumen (tras comprar, cambiar ajustes, etc.). */
  recargar: () => Promise<void>;
  comprar: (packId: string, modalidad: "unico" | "bono_mensual") => Promise<ResultadoAccion>;
  cancelarBono: () => Promise<ResultadoAccion>;
  guardarAjustes: (cuerpo: Record<string, unknown>) => Promise<ResultadoAccion>;
};

const Ctx = createContext<Valor | null>(null);

/** La empresa sale de la sesión en el servidor: aquí nunca se envía un identificador de empresa. */
async function llamar(ruta: string, metodo: "GET" | "POST" | "PATCH", cuerpo?: unknown): Promise<ResultadoAccion> {
  try {
    const r = await fetch(`/api/creditos/${ruta}`, {
      method: metodo,
      headers: cuerpo === undefined ? undefined : { "content-type": "application/json" },
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
      cache: "no-store",
    });
    const datos = (await r.json().catch(() => ({}))) as Record<string, unknown>;
    if (!r.ok) return { ok: false, mensaje: typeof datos.mensaje === "string" ? datos.mensaje : "No se pudo completar la operación." };
    return { ok: true, datos };
  } catch {
    return { ok: false, mensaje: "No se pudo contactar con el servidor." };
  }
}

export function CreditosProvider({ children }: { children: ReactNode }) {
  const [estado, setEstado] = useState<Estado>("cargando");
  const [resumen, setResumen] = useState<ResumenCreditos | null>(null);

  const aplicar = useCallback((r: ResultadoAccion) => {
    if (r.ok) {
      setResumen(r.datos as ResumenCreditos);
      setEstado("listo");
    } else setEstado((e) => (e === "listo" ? e : "error"));
  }, []);
  const recargar = useCallback(() => llamar("resumen", "GET").then(aplicar), [aplicar]);

  useEffect(() => {
    // El estado se actualiza al llegar la respuesta (en el `then`), no de forma síncrona dentro del efecto.
    void llamar("resumen", "GET").then(aplicar);
    // Refresco periódico y al volver a la pestaña: el saldo cambia cuando trabajan los agentes.
    const id = setInterval(() => void recargar(), 60_000);
    const alVolver = () => document.visibilityState === "visible" && void recargar();
    document.addEventListener("visibilitychange", alVolver);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", alVolver);
    };
  }, [recargar, aplicar]);

  const y = useCallback(async (p: Promise<ResultadoAccion>) => {
    const r = await p;
    if (r.ok) await recargar();
    return r;
  }, [recargar]);

  const valor = useMemo<Valor>(() => ({
    estado, resumen, recargar,
    comprar: (packId, modalidad) => y(llamar("comprar", "POST", { packId, modalidad })),
    cancelarBono: () => y(llamar("cancelar-bono", "POST")),
    guardarAjustes: (cuerpo) => y(llamar("ajustes", "PATCH", cuerpo)),
  }), [estado, resumen, recargar, y]);

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

export function useCreditos() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useCreditos debe usarse dentro de CreditosProvider");
  return c;
}

/**
 * Proveedor con un resumen fijo, para enseñar los paneles de créditos fuera de la oficina (web pública).
 * No llama al servidor: cualquier acción responde que es una demostración.
 */
export function CreditosDeEjemplo({ resumen, children }: { resumen: ResumenCreditos; children: ReactNode }) {
  const valor = useMemo<Valor>(() => {
    const demo = async (): Promise<ResultadoAccion> => ({ ok: false, mensaje: "Demostración: no se compra ni se cambia nada." });
    return { estado: "listo", resumen, recargar: async () => {}, comprar: demo, cancelarBono: demo, guardarAjustes: demo };
  }, [resumen]);
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}
