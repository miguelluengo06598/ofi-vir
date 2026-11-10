/**
 * Alto mínimo de la demo de la oficina, medido por ancho (cabecera, tarjetas y texto del traspaso).
 * Lo usan la demo y su reserva: al terminar de cargar no crece y no hay saltos de diseño.
 * Medido en nov. 2026 (390 px: 857 · 768: 815 · 1100: 603 · 1300: 418); revisar si cambian las tarjetas.
 */
export const ALTO_DEMO_OFICINA = "min-h-[870px] sm:min-h-[830px] lg:min-h-[620px] xl:min-h-[430px]";

/** Hueco con la forma de la demo mientras se carga. */
export function ReservaDemoOficina() {
  return (
    <div aria-hidden="true" className={`flex flex-col gap-4 ${ALTO_DEMO_OFICINA}`}>
      <div className="h-10" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:pt-14 xl:grid-cols-5">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className={`h-[218px] rounded-card bg-white/5 ring-1 ring-white/10 xl:h-[270px] ${i > 2 ? "hidden sm:block" : ""}`} />
        ))}
      </div>
    </div>
  );
}
