import Image from "next/image";
import { GlassPanel } from "@/components/glass";
import { cifrasClientes, logosClientes, testimonios } from "@/data/publico";
import { Seccion } from "./Seccion";

/**
 * Testimonios, logos y cifras de clientes. Preparado pero OCULTO: no se pinta nada mientras las
 * listas de `src/data/publico.ts` estén vacías. Solo se rellenan con datos reales y autorizados.
 */
export function PruebaSocial() {
  if (!testimonios.length && !logosClientes.length && !cifrasClientes.length) return null;
  return (
    <Seccion id="clientes" titulo="Empresas que ya trabajan así">
      {logosClientes.length > 0 && (
        <ul className="mb-8 flex flex-wrap items-center gap-8">
          {logosClientes.map((l) => (
            <li key={l.nombre}>
              <Image src={l.src} alt={l.nombre} width={l.ancho} height={l.alto} className="h-8 w-auto opacity-90" />
            </li>
          ))}
        </ul>
      )}
      {cifrasClientes.length > 0 && (
        <dl className="mb-8 grid gap-4 sm:grid-cols-3">
          {cifrasClientes.map((c) => (
            <GlassPanel key={c.texto} className="rounded-card! p-5">
              <dt className="text-small text-ink-2">{c.texto}</dt>
              <dd className="mt-1 text-[28px] font-semibold">{c.valor}</dd>
              <dd className="mt-1 text-tiny text-ink-3">Fuente: {c.fuente}</dd>
            </GlassPanel>
          ))}
        </dl>
      )}
      {testimonios.length > 0 && (
        <ul className="grid gap-4 md:grid-cols-2">
          {testimonios.map((t) => (
            <GlassPanel as="li" key={t.nombre} className="rounded-card! p-6">
              <blockquote className="text-body">«{t.cita}»</blockquote>
              <p className="mt-4 text-small text-ink-2">
                {t.nombre} · {t.cargo}, {t.empresa}
              </p>
            </GlassPanel>
          ))}
        </ul>
      )}
    </Seccion>
  );
}
