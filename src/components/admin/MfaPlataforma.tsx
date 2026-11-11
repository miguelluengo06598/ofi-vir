"use client";

import { createBrowserClient } from "@supabase/ssr";
import { useState } from "react";
import { ShieldCheck } from "lucide-react";

type Factor = { id: string; totp?: { qr_code: string; secret: string } };

export function MfaPlataforma() {
  const [factor, setFactor] = useState<Factor | null>(null);
  const [codigo, setCodigo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const supabase = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  async function preparar() {
    setOcupado(true); setError(null);
    const { data, error: fallo } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: "MyOfia Admin" });
    setOcupado(false);
    if (fallo || !data) return setError(fallo?.message ?? "No se pudo preparar la autenticación.");
    setFactor(data as Factor);
  }
  async function verificar(e: React.FormEvent) {
    e.preventDefault(); if (!factor || codigo.trim().length !== 6) return;
    setOcupado(true); setError(null);
    const { error: fallo } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code: codigo.trim() });
    setOcupado(false);
    if (fallo) return setError(fallo.message);
    window.location.assign("/admin");
  }
  return (
    <section className="glass w-full max-w-lg rounded-panel p-6 text-white sm:p-8">
      <span className="flex size-11 items-center justify-center rounded-full bg-white/15"><ShieldCheck size={22} /></span>
      <h1 className="mt-4 text-h1">Protege tu acceso de MyOfia</h1>
      <p className="mt-3 text-body text-ink-2">El panel interno requiere una app de autenticación. Esta comprobación se repite en cada sesión administrativa.</p>
      {!factor ? <button type="button" onClick={() => void preparar()} disabled={ocupado} className="mt-6 rounded-pill bg-white px-5 py-3 text-small font-semibold text-black disabled:opacity-60">{ocupado ? "Preparando…" : "Configurar app de autenticación"}</button> : (
        <form onSubmit={verificar} className="mt-6 grid gap-4">
          {factor.totp?.qr_code && <img src={factor.totp.qr_code} alt="Código QR para añadir MyOfia Admin a tu aplicación de autenticación" className="mx-auto size-52 rounded-card bg-white p-3" />}
          <p className="text-small text-ink-2">Escanea el código QR y escribe el código de seis dígitos que te muestra la aplicación.</p>
          <input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={codigo} onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ""))} className="rounded-card bg-black/30 px-4 py-3 text-center text-xl tracking-[0.35em] outline-none ring-1 ring-white/20 focus:ring-2 focus:ring-white" aria-label="Código de autenticación" />
          <button type="submit" disabled={ocupado || codigo.length !== 6} className="rounded-pill bg-white px-5 py-3 text-small font-semibold text-black disabled:opacity-60">{ocupado ? "Verificando…" : "Verificar y entrar"}</button>
        </form>
      )}
      {error && <p role="alert" className="mt-4 text-small text-status-error">{error}</p>}
    </section>
  );
}
