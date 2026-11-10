/** robots.txt (RFC 9309): grupos por agente, Allow/Disallow con `*` y `$`, gana la regla más larga y, a igualdad, Allow. */

export type Robots = { permite(rutaYConsulta: string): boolean; retrasoSegundos: number | null };

export const PERMITE_TODO: Robots = { permite: () => true, retrasoSegundos: null };
export const PROHIBE_TODO: Robots = { permite: () => false, retrasoSegundos: null };

type Regla = { permitir: boolean; patron: RegExp; largo: number };

function aRegex(patron: string): RegExp {
  const fin = patron.endsWith("$");
  const cuerpo = (fin ? patron.slice(0, -1) : patron).split("*").map((t) => t.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*");
  return new RegExp(`^${cuerpo}${fin ? "$" : ""}`);
}

export function parsearRobots(texto: string, agente: string): Robots {
  const grupos: { agentes: string[]; reglas: Regla[]; retraso: number | null }[] = [];
  let actual: (typeof grupos)[number] | null = null;
  let leyendoAgentes = false;
  for (const linea of texto.split(/\r?\n/)) {
    const l = linea.replace(/#.*$/, "").trim();
    const i = l.indexOf(":");
    if (i < 0) continue;
    const campo = l.slice(0, i).trim().toLowerCase();
    const valor = l.slice(i + 1).trim();
    if (campo === "user-agent") {
      if (!leyendoAgentes || !actual) { actual = { agentes: [], reglas: [], retraso: null }; grupos.push(actual); }
      actual.agentes.push(valor.toLowerCase());
      leyendoAgentes = true;
      continue;
    }
    leyendoAgentes = false;
    if (!actual) continue;
    if (campo === "allow" || campo === "disallow") {
      if (valor === "") continue; // «Disallow:» vacío = todo permitido
      actual.reglas.push({ permitir: campo === "allow", patron: aRegex(valor), largo: valor.length });
    } else if (campo === "crawl-delay") {
      const n = Number(valor);
      if (Number.isFinite(n) && n >= 0) actual.retraso = n;
    }
  }
  const nombre = agente.toLowerCase();
  // Grupos cuyo agente aparece en nuestro nombre (el más largo, el más específico); si no hay, el «*».
  const propios = grupos.filter((g) => g.agentes.some((a) => a !== "*" && a !== "" && nombre.includes(a)));
  const elegidos = propios.length ? propios : grupos.filter((g) => g.agentes.includes("*"));
  const reglas = elegidos.flatMap((g) => g.reglas);
  const retraso = elegidos.map((g) => g.retraso).find((r) => r !== null) ?? null;
  return {
    retrasoSegundos: retraso,
    permite(ruta) {
      let mejor: Regla | null = null;
      for (const r of reglas) {
        if (!r.patron.test(ruta)) continue;
        if (!mejor || r.largo > mejor.largo || (r.largo === mejor.largo && r.permitir)) mejor = r;
      }
      return mejor ? mejor.permitir : true;
    },
  };
}
