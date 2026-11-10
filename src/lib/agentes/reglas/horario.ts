import type { Horario } from "../instrucciones.ts";
export { dentroDeHorario } from "../instrucciones.ts";

const DIAS = ["dom", "lun", "mar", "mie", "jue", "vie", "sab"] as const;   // índice = getUTCDay()

/** Fecha y hora «de pared» de un instante en una zona horaria. */
function pared(ahora: Date, zona: string) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: zona, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
      .formatToParts(ahora).map((x) => [x.type, x.value]),
  );
  return { y: Number(p.year), m: Number(p.month), d: Number(p.day), hh: Number(p.hour), mm: Number(p.minute), ss: Number(p.second) };
}

/** El instante (UTC) en que, en `zona`, el reloj marca esa fecha y hora. Corrige el desfase dos veces (cambios de hora). */
export function instanteLocal(y: number, m: number, d: number, hh: number, mm: number, zona: string): Date {
  const objetivo = Date.UTC(y, m - 1, d, hh, mm, 0);
  let t = objetivo;
  for (let i = 0; i < 2; i++) {
    const p = pared(new Date(t), zona);
    t -= Date.UTC(p.y, p.m - 1, p.d, p.hh, p.mm, p.ss) - objetivo;
  }
  return new Date(t);
}

/** Primer instante del mes (en la zona del agente) al que pertenece `ahora`: desde ahí cuenta el tope de créditos mensual. */
export function inicioDelMes(ahora: Date, zona: string): Date {
  const p = pared(ahora, zona);
  return instanteLocal(p.y, p.m, 1, 0, 0, zona);
}

const aMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/**
 * Cuándo vuelve a abrir el horario: el comienzo de la primera franja posterior a `ahora` (mira hasta 8 días). null si el horario no tiene ninguna franja.
 * Pensada para llamarla fuera de horario; si `ahora` está dentro de una franja, devuelve la siguiente.
 */
export function proximaApertura(horario: Horario, zona: string, ahora: Date): Date | null {
  const hoy = pared(ahora, zona);
  for (let off = 0; off <= 8; off++) {
    const civil = new Date(Date.UTC(hoy.y, hoy.m - 1, hoy.d + off));
    const franjas = [...(horario[DIAS[civil.getUTCDay()]] ?? [])].sort((a, b) => aMin(a[0]) - aMin(b[0]));
    for (const [desde] of franjas) {
      const cand = instanteLocal(civil.getUTCFullYear(), civil.getUTCMonth() + 1, civil.getUTCDate(), Math.floor(aMin(desde) / 60), aMin(desde) % 60, zona);
      if (cand.getTime() > ahora.getTime()) return cand;
    }
  }
  return null;
}
