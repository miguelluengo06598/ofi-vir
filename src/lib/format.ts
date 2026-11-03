const grouped = { useGrouping: "always" } as Intl.NumberFormatOptions;

/** 12480 → «12.480» (en es-ES los números de 4 cifras no se agrupan por defecto). */
export const fmtNumber = (n: number, decimals = 0) =>
  n.toLocaleString("es-ES", { ...grouped, minimumFractionDigits: decimals, maximumFractionDigits: decimals });

export const fmtCredits = (n: number, decimals = 0) => `${fmtNumber(n, decimals)} créditos`;

export const fmtEur = (n: number) =>
  n.toLocaleString("es-ES", { ...grouped, style: "currency", currency: "EUR" });

/** «2026-10-27T16:40:00» → «27 oct 2026, 16:40». Las fechas sin zona horaria se leen y se muestran en hora local. */
export const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString("es-ES", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

/** Fecha ISO en hora local y sin zona (mismo formato que los datos de ejemplo, así se ordenan como texto). */
export const localIso = (d: Date = new Date()) => {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};
