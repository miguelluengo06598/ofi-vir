"use client";

import { useCallback, useEffect, useState } from "react";
import { GlassPanel, PillButton } from "@/components/glass";
import { ResumenFacebook } from "./meta/TarjetaFacebook";

type Ficha = {
  id: string; nombre: string; logo: string; descripcion: string; tipoAuth: "oauth2" | "api_key" | "dominio"; disponible: boolean; demo: boolean;
  herramientas: { id: string; nombre: string }[];
  conexion: { id: string; estado: string; cuentaExterna: string | null; ultimoError: string | null } | null;
};

const ESTADO: Record<string, string> = { conectado: "Conectada", caducado: "Caducada: hay que volver a conectarla", desconectado: "Desconectada", error: "Con error" };
const AVISO: Record<string, string> = { ok: "Conexión creada correctamente.", cancelado: "Cancelaste la autorización: no se ha conectado nada.", error: "No se pudo completar la conexión. Inténtalo de nuevo." };

/** Aplicaciones que se pueden conectar. Nunca recibe ni muestra tokens: solo el estado. */
export function ConexionesView() {
  const [fichas, setFichas] = useState<Ficha[] | null>(null);
  const [error, setError] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      const r = await fetch("/api/conexiones", { cache: "no-store" });
      if (!r.ok) throw new Error();
      setFichas((await r.json()).proveedores);
      setError(false);
      // Resultado del flujo OAuth (viene en la URL al volver del proveedor; no lleva datos sensibles).
      const resultado = new URLSearchParams(window.location.search).get("resultado");
      if (resultado) setAviso((previo) => previo ?? AVISO[resultado] ?? null);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial: el estado se actualiza tras la respuesta
    void cargar();
  }, [cargar]);

  // Ruta de API que redirige fuera de la app: hace falta navegación completa (no el router de Next).
  const irA = (ruta: string) => window.location.assign(ruta);

  const desconectar = async (id: string) => {
    const r = await fetch(`/api/conexiones/${id}/desconectar`, { method: "POST" });
    setAviso(r.ok ? "Aplicación desconectada: se ha borrado su acceso." : "No se pudo desconectar.");
    await cargar();
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-h1">Aplicaciones conectadas</h1>
        <p className="text-body text-ink-2">Conecta las aplicaciones que usan tus agentes. Sin conexión, sus herramientas no funcionan.</p>
      </div>
      {aviso && <p role="status" className="rounded-card bg-white/10 p-4 text-body">{aviso}</p>}
      {error && <p role="alert" className="text-body">No se pudieron cargar las aplicaciones.</p>}
      {!fichas && !error && <p role="status" className="text-body text-ink-2">Cargando…</p>}
      <ul className="grid gap-4 sm:grid-cols-2">
        {fichas?.filter((f) => f.disponible || f.conexion).map((f) => (
          <li key={f.id}>
            <GlassPanel className="flex h-full flex-col gap-3 p-5">
              <div className="flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={f.logo} alt="" width={40} height={40} />
                <div>
                  <h2 className="text-h2">{f.nombre}{f.demo ? " (demo)" : ""}</h2>
                  <p className="text-small text-ink-2">{f.conexion ? ESTADO[f.conexion.estado] ?? f.conexion.estado : "Sin conectar"}{f.conexion?.cuentaExterna ? ` · ${f.conexion.cuentaExterna}` : ""}</p>
                </div>
              </div>
              <p className="text-small text-ink-2">{f.descripcion}</p>
              {f.herramientas.length > 0 && <p className="text-small text-ink-3">Habilita: {f.herramientas.map((h) => h.nombre).join(", ")}</p>}
              {f.id === "meta_leads" && <ResumenFacebook />}
              <div className="mt-auto flex gap-2">
                {f.conexion?.estado === "conectado" ? (
                  <PillButton onClick={() => void desconectar(f.conexion!.id)}>Desconectar</PillButton>
                ) : f.tipoAuth === "oauth2" && f.disponible ? (
                  <PillButton solid onClick={() => irA(`/api/conexiones/${f.id}/iniciar`)}>{f.conexion ? "Volver a conectar" : f.id === "meta_leads" ? "Conectar Facebook" : "Conectar"}</PillButton>
                ) : (
                  <span className="text-small text-ink-3">{f.tipoAuth === "oauth2" ? "No disponible todavía" : "Se conecta con una clave"}</span>
                )}
              </div>
            </GlassPanel>
          </li>
        ))}
      </ul>
    </div>
  );
}
