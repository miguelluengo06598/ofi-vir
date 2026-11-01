const grouped = { useGrouping: "always" } as Intl.NumberFormatOptions;

/** 12480 → «12.480» (en es-ES los números de 4 cifras no se agrupan por defecto). */
export const fmtNumber = (n: number, decimals = 0) =>
  n.toLocaleString("es-ES", { ...grouped, minimumFractionDigits: decimals, maximumFractionDigits: decimals });

export const fmtCredits = (n: number, decimals = 0) => `${fmtNumber(n, decimals)} créditos`;

export const fmtEur = (n: number) =>
  n.toLocaleString("es-ES", { ...grouped, style: "currency", currency: "EUR" });
