"use client";

import Script, { type ScriptProps } from "next/script";
import { useEffect, useId, useState, useSyncExternalStore } from "react";
import { GlassPanel, PillButton } from "@/components/glass";
import {
  CATEGORIAS,
  CONSENTIMIENTO_ACTIVADO,
  VERSION_CONSENTIMIENTO,
  categoriasOpcionales,
  type CategoriaOpcional,
} from "@/config/cookies";

/**
 * Consentimiento previo de cookies. PREPARADO Y DESACTIVADO (CONSENTIMIENTO_ACTIVADO = false):
 * mientras lo esté, el banner no aparece y ScriptConConsentimiento no carga nada.
 * Rechazar es tan fácil como aceptar, y nada opcional se carga antes de una decisión.
 */

type Decision = { v: number; fecha: string; categorias: Partial<Record<CategoriaOpcional, boolean>> };

const CLAVE = "consentimiento-cookies";
const EVENTO = "consentimiento-cookies-cambio";
const ABRIR = "consentimiento-cookies-abrir";

function leer(): string | null {
  try {
    return localStorage.getItem(CLAVE);
  } catch {
    return null;
  }
}

function decisionDe(crudo: string | null): Decision | null {
  if (!crudo) return null;
  try {
    const d = JSON.parse(crudo) as Decision;
    return d.v === VERSION_CONSENTIMIENTO ? d : null; // Otra versión de la lista: se vuelve a preguntar.
  } catch {
    return null;
  }
}

function guardar(categorias: Decision["categorias"]) {
  try {
    localStorage.setItem(CLAVE, JSON.stringify({ v: VERSION_CONSENTIMIENTO, fecha: new Date().toISOString(), categorias }));
  } catch {
    /* sin almacenamiento: se volverá a preguntar, y sin permiso no se carga nada */
  }
  window.dispatchEvent(new Event(EVENTO));
}

function suscribir(cambio: () => void) {
  window.addEventListener(EVENTO, cambio);
  window.addEventListener("storage", cambio);
  return () => {
    window.removeEventListener(EVENTO, cambio);
    window.removeEventListener("storage", cambio);
  };
}

/** Decisión guardada (null = sin decidir). En el servidor siempre null: nada opcional se pinta en el HTML. */
export function useConsentimiento(): Decision | null {
  const crudo = useSyncExternalStore(suscribir, leer, () => null);
  return decisionDe(crudo);
}

const opcionales = categoriasOpcionales();
const activo = CONSENTIMIENTO_ACTIVADO && opcionales.length > 0;

export function BannerConsentimiento() {
  const decision = useConsentimiento();
  const [reabierto, setReabierto] = useState(false);
  const [configurando, setConfigurando] = useState(false);
  const [marcadas, setMarcadas] = useState<Partial<Record<CategoriaOpcional, boolean>>>({});
  const tituloId = useId();

  useEffect(() => {
    const abrir = () => setReabierto(true);
    window.addEventListener(ABRIR, abrir);
    return () => window.removeEventListener(ABRIR, abrir);
  }, []);

  if (!activo || (decision && !reabierto)) return null;

  const decidir = (categorias: Decision["categorias"]) => {
    guardar(categorias);
    setReabierto(false);
    setConfigurando(false);
  };
  const todas = (valor: boolean) => Object.fromEntries(opcionales.map((c) => [c, valor]));

  return (
    <div role="dialog" aria-labelledby={tituloId} aria-modal="false" className="fixed inset-x-0 bottom-0 z-[90] p-3 sm:p-4">
      <GlassPanel strong className="mx-auto max-w-3xl p-5 sm:p-6">
        <h2 id={tituloId} className="text-body font-semibold">Cookies</h2>
        <p className="mt-2 text-small text-ink-2">
          Usamos cookies técnicas para que la web funcione. Con tu permiso, usaríamos también cookies de{" "}
          {opcionales.map((c) => CATEGORIAS[c].nombre.toLowerCase()).join(" y ")}. Puedes cambiar de opinión cuando quieras en la{" "}
          <a href="/cookies" className="text-white underline underline-offset-4">política de cookies</a>.
        </p>
        {configurando && (
          <fieldset className="mt-4 flex flex-col gap-3">
            <legend className="sr-only">Elige qué cookies aceptas</legend>
            <label className="flex items-start gap-3 text-small">
              <input type="checkbox" checked disabled className="mt-1" />
              <span><span className="font-semibold">{CATEGORIAS.tecnica.nombre}</span> · {CATEGORIAS.tecnica.descripcion}</span>
            </label>
            {opcionales.map((c) => (
              <label key={c} className="flex items-start gap-3 text-small">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={marcadas[c] ?? false}
                  onChange={(e) => setMarcadas((m) => ({ ...m, [c]: e.target.checked }))}
                />
                <span><span className="font-semibold">{CATEGORIAS[c].nombre}</span> · {CATEGORIAS[c].descripcion}</span>
              </label>
            ))}
          </fieldset>
        )}
        {/* Mismo peso visual para rechazar y aceptar. */}
        <div className="mt-4 flex flex-wrap gap-2">
          <PillButton onClick={() => decidir(todas(false))}>Rechazar</PillButton>
          {configurando ? (
            <PillButton onClick={() => decidir(marcadas)}>Guardar mi elección</PillButton>
          ) : (
            <PillButton onClick={() => setConfigurando(true)}>Configurar</PillButton>
          )}
          <PillButton onClick={() => decidir(todas(true))}>Aceptar</PillButton>
        </div>
      </GlassPanel>
    </div>
  );
}

/** Botón para volver a abrir el banner. No se muestra mientras no haya cookies opcionales. */
export function BotonPreferenciasCookies() {
  if (!activo) return null;
  return <PillButton onClick={() => window.dispatchEvent(new Event(ABRIR))}>Cambiar mis preferencias de cookies</PillButton>;
}

/**
 * Única forma permitida de cargar un script de terceros que use cookies opcionales:
 * solo se inserta en la página si la persona ha aceptado esa categoría.
 */
export function ScriptConConsentimiento({ categoria, ...props }: ScriptProps & { categoria: CategoriaOpcional }) {
  const decision = useConsentimiento();
  if (!activo || !decision?.categorias[categoria]) return null;
  return <Script strategy="afterInteractive" {...props} />;
}
