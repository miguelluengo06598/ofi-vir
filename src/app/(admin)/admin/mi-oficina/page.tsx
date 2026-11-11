import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { ArrowRight, Building2 } from "lucide-react";
import { MiOficinaForm } from "@/components/admin/MiOficinaForm";
import { GlassPanel } from "@/components/glass";
import { exigirRolPlataforma } from "@/lib/admin/acceso";
import { dbAdminDesdeEntorno } from "@/lib/admin/entorno";
import { oficinasDe } from "@/lib/admin/oficinaPropia";
import { entrarEnMiOficina } from "./acciones";

export const metadata: Metadata = { title: "Mi oficina", robots: { index: false, follow: false } };
export const instant = false;

const ESTADO: Record<string, string> = { activa: "Activa", en_implantacion: "En implantación", suspendida: "Suspendida" };

/** La oficina propia de MyOfia: MyOfia usa el producto como una empresa más. Solo administración. */
export default async function MiOficinaPage() {
  const db = dbAdminDesdeEntorno();
  const sesion = db ? await exigirRolPlataforma(["admin_samgple"], await headers(), db) : null;
  if (!db || !sesion) notFound();
  const oficinas = await oficinasDe(db, sesion.userId);

  return (
    <GlassPanel as="section" className="flex flex-col gap-5 p-6 sm:p-8">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white/15"><Building2 size={20} aria-hidden="true" /></span>
        <div>
          <h1 className="text-h1">Mi oficina</h1>
          <p className="mt-1 max-w-2xl text-body text-ink-2">
            MyOfia usa su propio producto como una empresa más: con sus departamentos, sus agentes, sus créditos y sus aprobaciones.
            Entras como propietario y solo ves los datos de esta oficina; las de los clientes siguen sin ser visibles desde aquí.
          </p>
        </div>
      </div>

      {oficinas.length === 0 ? (
        <>
          <p className="max-w-2xl text-small text-ink-2">
            Todavía no existe. Al crearla nace con los cinco departamentos (Ventas, Atención al cliente, Marketing, Operaciones · CRM y
            Dirección), en estado «en implantación» y sin créditos. Aparecerá en Clientes como una empresa más: desde su ficha puedes
            regalarle créditos y seguir su implantación.
          </p>
          <MiOficinaForm />
        </>
      ) : (
        <ul className="grid gap-3">
          {oficinas.map((o) => (
            <li key={o.companyId} className="flex flex-wrap items-center justify-between gap-3 rounded-card bg-white/5 px-4 py-3 ring-1 ring-white/10">
              <div>
                <p className="text-body font-semibold">{o.nombre}</p>
                <p className="text-small text-ink-2">{ESTADO[o.estado] ?? o.estado} · eres {o.rol}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Link href={`/admin/clientes/${o.companyId}`} className="rounded-pill px-4 py-2 text-small ring-1 ring-white/25 hover:bg-white/10">Ficha en Clientes</Link>
                <form action={entrarEnMiOficina}>
                  <input type="hidden" name="companyId" value={o.companyId} />
                  <button type="submit" className="inline-flex items-center gap-2 rounded-pill bg-white px-4 py-2 text-small font-semibold text-black">
                    Entrar en la oficina <ArrowRight size={16} aria-hidden="true" />
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
    </GlassPanel>
  );
}
