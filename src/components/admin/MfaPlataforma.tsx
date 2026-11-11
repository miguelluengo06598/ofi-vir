"use client";

import { createBrowserClient } from "@supabase/ssr";
import { ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type Paso =
  | { tipo: "cargando" }
  | { tipo: "sin_app" } // Primera vez: hay que añadir la app de autenticación.
  | { tipo: "alta"; factorId: string; qr: string; secreto: string } // QR a la vista, falta el primer código.
  | { tipo: "codigo"; factorId: string }; // Ya tiene app: solo pide el código de esta sesión.

const ERROR_GENERICO = "No se ha podido completar. Inténtalo de nuevo.";

/**
 * Verificación en dos pasos del panel interno. La primera vez configura la app de autenticación (QR); en las
 * siguientes sesiones solo pide el código de seis cifras de la app que ya está dada de alta.
 */
export function MfaPlataforma() {
  const supabase = useMemo(() => createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!), []);
  const [paso, setPaso] = useState<Paso>({ tipo: "cargando" });
  const [codigo, setCodigo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    let vivo = true;
    void supabase.auth.mfa.listFactors().then(({ data, error: fallo }) => {
      if (!vivo) return;
      if (fallo) { setError("No se ha podido leer tu verificación en dos pasos. Recarga la página."); return; }
      const verificado = data?.totp.find((f) => f.status === "verified");
      setPaso(verificado ? { tipo: "codigo", factorId: verificado.id } : { tipo: "sin_app" });
    });
    return () => { vivo = false; };
  }, [supabase]);

  async function preparar() {
    setOcupado(true); setError(null);
    // Un alta a medias (QR que nunca se confirmó) impediría crear otra: se retira antes.
    const { data: lista } = await supabase.auth.mfa.listFactors();
    for (const f of lista?.all ?? []) if (f.status !== "verified") await supabase.auth.mfa.unenroll({ factorId: f.id });
    const { data, error: fallo } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: "MyOfia Admin" });
    setOcupado(false);
    if (fallo || !data || data.type !== "totp") { setError(ERROR_GENERICO); return; }
    setPaso({ tipo: "alta", factorId: data.id, qr: data.totp.qr_code, secreto: data.totp.secret });
  }

  async function verificar(e: React.FormEvent) {
    e.preventDefault();
    if ((paso.tipo !== "alta" && paso.tipo !== "codigo") || codigo.length !== 6) return;
    setOcupado(true); setError(null);
    const { error: fallo } = await supabase.auth.mfa.challengeAndVerify({ factorId: paso.factorId, code: codigo });
    setOcupado(false);
    if (fallo) { setCodigo(""); setError("El código no es correcto o ha caducado. Escribe el que muestra ahora la app."); return; }
    window.location.assign("/admin");
  }

  const pidiendoCodigo = paso.tipo === "alta" || paso.tipo === "codigo";
  return (
    <section className="glass w-full max-w-lg rounded-panel p-6 text-white sm:p-8">
      <span className="flex size-11 items-center justify-center rounded-full bg-white/15"><ShieldCheck size={22} aria-hidden="true" /></span>
      <h1 className="mt-4 text-h1">{paso.tipo === "codigo" ? "Verificación en dos pasos" : "Protege tu acceso de MyOfia"}</h1>
      <p className="mt-3 text-body text-ink-2">
        {paso.tipo === "codigo"
          ? "Escribe el código de seis cifras de tu app de autenticación para entrar al panel."
          : "El panel interno requiere una app de autenticación (Google Authenticator, 1Password, Authy…). El código se pide en cada sesión."}
      </p>

      {paso.tipo === "cargando" && !error && <p role="status" className="mt-6 text-small text-ink-2">Comprobando…</p>}

      {paso.tipo === "sin_app" && (
        <button type="button" onClick={() => void preparar()} disabled={ocupado} className="mt-6 rounded-pill bg-white px-5 py-3 text-small font-semibold text-black disabled:opacity-60">
          {ocupado ? "Preparando…" : "Configurar app de autenticación"}
        </button>
      )}

      {pidiendoCodigo && (
        <form onSubmit={verificar} className="mt-6 grid gap-4">
          {paso.tipo === "alta" && (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element -- QR generado por Supabase como data: URI */}
              <img src={paso.qr} alt="Código QR para añadir MyOfia Admin a tu aplicación de autenticación" className="mx-auto size-52 rounded-card bg-white p-3" />
              <p className="text-small text-ink-2">
                Escanea el código QR con la app y escribe el código de seis cifras que te muestre. Si no puedes escanearlo, introduce esta clave a mano:{" "}
                <code className="break-all text-white">{paso.secreto}</code>
              </p>
            </>
          )}
          <input
            inputMode="numeric" autoComplete="one-time-code" maxLength={6} autoFocus value={codigo}
            onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ""))}
            className="rounded-card bg-black/30 px-4 py-3 text-center text-xl tracking-[0.35em] outline-none ring-1 ring-white/20 focus:ring-2 focus:ring-white"
            aria-label="Código de autenticación de seis cifras"
          />
          <button type="submit" disabled={ocupado || codigo.length !== 6} className="rounded-pill bg-white px-5 py-3 text-small font-semibold text-black disabled:opacity-60">
            {ocupado ? "Verificando…" : "Verificar y entrar"}
          </button>
        </form>
      )}

      {error && <p role="alert" className="mt-4 text-small text-status-error">{error}</p>}
    </section>
  );
}
