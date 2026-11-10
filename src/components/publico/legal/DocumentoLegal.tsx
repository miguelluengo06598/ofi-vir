import type { ReactNode } from "react";
import { TriangleAlert } from "lucide-react";
import { GlassPanel } from "@/components/glass";
import { esMarcador } from "@/config/empresa";

/** Aviso interno: se ve en local y en los despliegues de prueba (Vercel preview), nunca en producción. */
export function AvisoBorrador() {
  const esPrueba = process.env.NODE_ENV !== "production" || ["preview", "development"].includes(process.env.VERCEL_ENV ?? "");
  if (!esPrueba) return null;
  return (
    <p role="note" className="mb-4 flex items-center gap-2 rounded-card bg-status-waiting px-4 py-3 text-small font-semibold text-black">
      <TriangleAlert size={18} aria-hidden="true" className="shrink-0" />
      Borrador pendiente de revisión por un abogado (aviso interno: no se muestra en producción).
    </p>
  );
}

/** Dato de la empresa: si sigue siendo un marcador «[…]», se resalta para que no pase desapercibido. */
export function Dato({ v }: { v: string }) {
  if (!esMarcador(v)) return <>{v}</>;
  return <mark className="rounded bg-status-waiting/25 px-1 text-white ring-1 ring-status-waiting/70">{v}</mark>;
}

export type Apartado = { id: string; titulo: string; cuerpo: ReactNode };

const fecha = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

/** Estilos de lectura para el texto legal: líneas cómodas, párrafos aireados y listas claras. */
const PROSA =
  "text-[16px] leading-[1.75] text-white/90 [&_a]:text-white [&_a]:underline [&_a]:underline-offset-4 " +
  "[&_p]:mt-3 [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:mt-3 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:mt-1.5 " +
  "[&_h3]:mt-6 [&_h3]:text-[17px] [&_h3]:font-semibold [&_strong]:font-semibold [&_strong]:text-white";

export function DocumentoLegal({
  titulo,
  actualizado,
  intro,
  apartados,
  extra,
}: {
  titulo: string;
  actualizado: string;
  intro?: ReactNode;
  apartados: Apartado[];
  extra?: ReactNode;
}) {
  return (
    <article aria-labelledby="legal-titulo" className="mx-auto w-full max-w-3xl px-4 pt-10 pb-16 sm:pt-14">
      <AvisoBorrador />
      <header className="enter">
        <h1 id="legal-titulo" className="text-[30px] leading-tight font-semibold sm:text-[40px]">{titulo}</h1>
        <p className="mt-2 text-small text-ink-2">
          Última actualización: <time dateTime={actualizado}>{fecha(actualizado)}</time>
        </p>
      </header>

      {/* Fondo más opaco que el cristal normal: el texto largo necesita más contraste. */}
      <GlassPanel className="mt-6 p-6 [--glass-fill:rgba(16,16,22,0.62)] sm:p-10">
        {intro && <div className={PROSA}>{intro}</div>}
        <nav aria-label="Índice" className={`${intro ? "mt-8" : ""} rounded-card bg-white/5 p-4 sm:p-5`}>
          <p className="text-small font-semibold">En esta página</p>
          <ol className="mt-2 grid gap-1 text-small text-ink-2 sm:grid-cols-2">
            {apartados.map((a, i) => (
              <li key={a.id}>
                <a href={`#${a.id}`} className="hover:text-white hover:underline">{i + 1}. {a.titulo}</a>
              </li>
            ))}
          </ol>
        </nav>
        {apartados.map((a, i) => (
          <section key={a.id} id={a.id} aria-labelledby={`${a.id}-t`} className="mt-10 scroll-mt-28">
            <h2 id={`${a.id}-t`} className="text-[21px] leading-snug font-semibold">{i + 1}. {a.titulo}</h2>
            <div className={PROSA}>{a.cuerpo}</div>
          </section>
        ))}
        {extra}
      </GlassPanel>
    </article>
  );
}
