/**
 * Al cambiar el modelo de IA de la plataforma: lanza el examen técnico de TODOS los agentes activos con el modelo nuevo y genera
 * un informe de los que suspenden.
 *   npm run certificacion:cambio-modelo -- --modelo=claude-sonnet-5-5
 *   npm run certificacion:cambio-modelo -- --modelo=claude-sonnet-5-5 --empresa=<uuid> --salida=informes/cambio-modelo.md
 * Gasta tokens reales (lo asume la plataforma, como cualquier examen). Necesita la base y ANTHROPIC_API_KEY.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { examenPorCambioDeModelo, informeCambioDeModeloEnTexto } from "../src/lib/certificacion/cambioModelo.ts";
import { depsExamenDesdeEntorno } from "../src/lib/certificacion/entorno.ts";
import { MODELOS } from "../src/lib/creditos/tarifas.ts";

const arg = (n: string) => process.argv.slice(2).find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
const modelo = arg("modelo");
const conocidos = Object.values(MODELOS) as string[];
if (!modelo || !conocidos.includes(modelo)) {
  console.error(`Uso: npm run certificacion:cambio-modelo -- --modelo=<${conocidos.join("|")}> [--empresa=<uuid>] [--salida=<archivo.md>]`);
  process.exit(1);
}
const deps = depsExamenDesdeEntorno();
if (!deps) {
  console.error("Faltan la base de datos (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) o ANTHROPIC_API_KEY: el examen necesita el motor de agentes.");
  process.exit(1);
}

console.log(`Examen técnico de los agentes activos con el modelo ${modelo}…`);
const informe = await examenPorCambioDeModelo(deps, { modelo, companyId: arg("empresa"), alAvanzar: (r) => console.log(`  ${r.resultado.padEnd(10)} ${r.nombre} (v${r.version})${r.detalle ? ` — ${r.detalle}` : ""}`) });
const texto = informeCambioDeModeloEnTexto(informe);
const salida = arg("salida") ?? `informes/cambio-modelo-${modelo}-${informe.fecha.slice(0, 10)}.md`;
mkdirSync(dirname(salida), { recursive: true });
writeFileSync(salida, texto);
console.log(`\n${texto}\nInforme guardado en ${salida}`);
process.exit(informe.suspendidos.length || informe.errores.length ? 2 : 0);
