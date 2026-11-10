/** Informe del examen para la EMPRESA: qué bloque falló, qué casos y cómo corregirlo. Nunca incluye instrucciones base ni datos de otras empresas. */
import { NOMBRE_BLOQUE, type ResultadoBloque, type ResultadoCaso, type ResultadoExamen } from "./tipos.ts";

export type Informe = {
  resultado: "aprobado" | "suspendido";
  notaGlobal: number;
  titulo: string;
  bloques: { bloque: string; nombre: string; nota: number; minima: number; aprobado: boolean; resumen: string; avisos: string[] }[];
  fallos: { bloque: string; nombreBloque: string; caso: string; titulo: string; gravedad: "grave" | "normal"; motivo: string; sugerencia: string; entrada: string }[];
  avisos: string[];
  siguientePaso: string;
};

const MAX_FALLOS = 25;
const recortar = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s);

export function construirInforme(r: ResultadoExamen, siguientePaso: string): Informe {
  const fallos = r.casos.filter((c) => !c.cumple).slice(0, MAX_FALLOS).map((c: ResultadoCaso) => ({
    bloque: c.bloque, nombreBloque: NOMBRE_BLOQUE[c.bloque], caso: c.id, titulo: c.titulo, gravedad: c.gravedad,
    motivo: c.motivo, sugerencia: c.sugerencia, entrada: recortar(c.entrada, 300),
  }));
  return {
    resultado: r.resultado, notaGlobal: r.notaGlobal,
    titulo: r.resultado === "aprobado" ? "Examen técnico aprobado" : "Examen técnico suspendido",
    bloques: r.bloques.map((b: ResultadoBloque) => ({ bloque: b.bloque, nombre: b.nombre, nota: b.nota, minima: b.minima, aprobado: b.aprobado, resumen: b.resumen, avisos: b.avisos })),
    fallos, avisos: r.bloques.flatMap((b) => b.avisos), siguientePaso,
  };
}

export function informeEnTexto(i: Informe): string {
  const l: string[] = [`${i.titulo.toUpperCase()} — nota global ${i.notaGlobal}/100`, ""];
  for (const b of i.bloques) l.push(`${b.aprobado ? "✔" : "✘"} ${b.nombre}: ${b.nota}/10 (mínimo ${b.minima}) — ${b.resumen}`);
  if (i.avisos.length) { l.push("", "Avisos:"); for (const a of i.avisos) l.push(`  ! ${a}`); }
  if (i.fallos.length) {
    l.push("", "Casos que fallan:");
    for (const f of i.fallos) {
      l.push(`  • [${f.nombreBloque}${f.gravedad === "grave" ? " · GRAVE" : ""}] ${f.titulo}`, `      Entrada: ${f.entrada.replace(/\s+/g, " ")}`, `      Qué pasó: ${f.motivo}`, `      Cómo corregirlo: ${f.sugerencia}`);
    }
  }
  l.push("", `Siguiente paso: ${i.siguientePaso}`);
  return l.join("\n");
}
