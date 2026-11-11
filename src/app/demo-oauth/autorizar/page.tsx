import { Suspense } from "react";
import { notFound } from "next/navigation";
import { demoActivo, validarSolicitud } from "@/lib/integraciones/demoOauth";

export const metadata = { title: "Autorizar · aplicación de demostración" };

type Q = Record<string, string | string[] | undefined>;
const uno = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/**
 * PANTALLA FALSA de «Autorizar» del proveedor demo (solo local: 404 si CONEXIONES_DEMO no está activo o en producción).
 * Imita la pantalla de consentimiento de una aplicación externa. El formulario envía a /api/demo-oauth/autorizar (POST).
 */
export default function Page({ searchParams }: { searchParams: Promise<Q> }) {
  return <Suspense fallback={<p role="status" className="p-8">Cargando…</p>}><Pantalla searchParams={searchParams} /></Suspense>;
}

async function Pantalla({ searchParams }: { searchParams: Promise<Q> }) {
  if (!demoActivo()) notFound();
  const sp = await searchParams;
  const q = {
    client_id: uno(sp.client_id), redirect_uri: uno(sp.redirect_uri), response_type: uno(sp.response_type), state: uno(sp.state),
    code_challenge: uno(sp.code_challenge), code_challenge_method: uno(sp.code_challenge_method), scope: uno(sp.scope),
  };
  const problema = validarSolicitud(q);
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-4 text-slate-900">
      <section aria-labelledby="titulo" className="w-full max-w-md rounded-2xl bg-white p-8 shadow-xl">
        <p className="mb-4 rounded-lg bg-amber-100 px-3 py-2 text-sm text-amber-900" role="note">
          Pantalla simulada: así se vería la autorización de una aplicación externa. No es una cuenta real.
        </p>
        <div className="mb-4 flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/integraciones/demo.svg" alt="" width={48} height={48} />
          <h1 id="titulo" className="text-xl font-semibold">Aplicación de demostración</h1>
        </div>
        {problema ? (
          <p role="alert" className="text-red-700">No se puede continuar: {problema}</p>
        ) : (
          <form method="post" action="/api/demo-oauth/autorizar" className="flex flex-col gap-4">
            <p>
              <strong>MyOfia</strong> quiere acceder a tu cuenta de demostración con este permiso:
            </p>
            <ul className="list-disc pl-6 text-sm">
              {(q.scope ?? "cuenta.leer").split(" ").map((s) => <li key={s}><code>{s}</code> · ver el nombre de tu cuenta</li>)}
            </ul>
            {(["client_id", "redirect_uri", "state", "code_challenge", "code_challenge_method", "scope"] as const).map((k) =>
              q[k] ? <input key={k} type="hidden" name={k} value={q[k]} /> : null)}
            <div className="flex gap-3">
              <button type="submit" name="decision" value="autorizar" className="flex-1 rounded-full bg-blue-600 px-4 py-3 font-medium text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">Autorizar</button>
              <button type="submit" name="decision" value="cancelar" className="flex-1 rounded-full border border-slate-300 px-4 py-3 font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-500">Cancelar</button>
            </div>
          </form>
        )}
      </section>
    </main>
  );
}
